import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ChildProcess } from "child_process";
import * as os from "os";
import { LRUCache } from "lru-cache";

// Store active MCP processes by session ID
// ⚠️ WARNING: This is in-memory and will be cleared on server restart!
// In production, consider using Redis or a proper process manager
// TODO: Restore processes from database on server startup
const activeProcesses = new Map<string, {
  process: ChildProcess;
  sessionId: string;
  pid: number;
}>();

// Cache active session info to avoid repeated database queries (~50-100ms saved per tool call)
const sessionCache = new LRUCache<string, {
  id: string;
  mode: string | null;
  serverType: "filesystem" | "image-editing";
  durationMinutes: number | null;
  startedAt: Date;
}>({
  max: 500, // Cache up to 500 user sessions
  ttl: 60000, // 1 minute TTL
  updateAgeOnGet: true, // Refresh TTL on access
});

/**
 * Invalidate session cache for a user and server type
 * Called when a new session is started to ensure immediate availability
 */
export function invalidateSessionCache(userId: string, serverType: "filesystem" | "image-editing") {
  const cacheKey = `session:${userId}:${serverType}`;
  sessionCache.delete(cacheKey);
  console.log(`[MCP Call] Invalidated cache for ${cacheKey}`);
}

// Cache process health status to avoid expensive health checks (~20-50ms saved per tool call)
const healthCache = new Map<string, { healthy: boolean; checkedAt: number }>();
const HEALTH_CACHE_TTL = 30000; // 30 seconds

// Track if we've attempted to restore processes on startup
let hasAttemptedRestore = false;

/**
 * Check if a process is still alive by verifying its PID exists
 */
async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    if (os.platform() === "win32") {
      // Windows: Use tasklist command
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      try {
        await execAsync(`tasklist /FI "PID eq ${pid}"`);
        return true;
      } catch {
        return false;
      }
    } else {
      // Unix: Use kill -0 to check if process exists
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      try {
        await execAsync(`kill -0 ${pid}`);
        return true;
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }
}

/**
 * Verify process is actually alive and healthy
 */
async function verifyProcessHealth(process: ChildProcess, pid: number): Promise<boolean> {
  // Check if process is killed
  if (process.killed) {
    console.log(`[Process Health] Process ${pid} is marked as killed`);
    return false;
  }

  // Check if process PID is still alive
  const pidAlive = await isProcessAlive(pid);
  if (!pidAlive) {
    console.log(`[Process Health] Process ${pid} PID check failed - process not alive`);
    return false;
  }

  // Check if stdin is available (needed to send requests)
  if (!process.stdin || process.stdin.destroyed) {
    console.log(`[Process Health] Process ${pid} stdin not available (stdin exists: ${!!process.stdin}, destroyed: ${process.stdin?.destroyed})`);
    return false;
  }

  // Check if stdout is available (needed to receive responses)
  if (!process.stdout || process.stdout.destroyed) {
    console.log(`[Process Health] Process ${pid} stdout not available (stdout exists: ${!!process.stdout}, destroyed: ${process.stdout?.destroyed})`);
    return false;
  }

  console.log(`[Process Health] Process ${pid} is healthy`);
  return true;
}

/**
 * Get cached process health status to avoid expensive checks on every tool call
 * Cache TTL is 30 seconds - balances freshness with performance
 */
async function getCachedProcessHealth(sessionId: string, process: ChildProcess, pid: number): Promise<boolean> {
  const cached = healthCache.get(sessionId);
  const now = Date.now();

  // Return cached result if still fresh
  if (cached && (now - cached.checkedAt) < HEALTH_CACHE_TTL) {
    return cached.healthy;
  }

  // Perform actual health check
  const healthy = await verifyProcessHealth(process, pid);

  // Update cache
  healthCache.set(sessionId, { healthy, checkedAt: now });

  // Clean up cache entry if process is unhealthy
  if (!healthy) {
    healthCache.delete(sessionId);
  }

  return healthy;
}

// Export helper to get process for a session (for use in stop route)
export async function getProcessForSession(sessionId: string): Promise<ChildProcess | null> {
  const entry = activeProcesses.get(sessionId);
  if (!entry) {
    console.warn(`[getProcessForSession] ⚠️ No entry found in activeProcesses for session ${sessionId}`);
    console.warn(`[getProcessForSession] This usually means:`);
    console.warn(`[getProcessForSession]   1. Server restarted (in-memory map cleared)`);
    console.warn(`[getProcessForSession]   2. Process was never registered`);
    console.warn(`[getProcessForSession]   3. Process exited and was cleaned up`);
    console.warn(`[getProcessForSession] Active sessions in map: ${Array.from(activeProcesses.keys()).join(", ") || "NONE"}`);
    console.warn(`[getProcessForSession] Total processes in map: ${activeProcesses.size}`);
    return null;
  }

  console.log(`[getProcessForSession] Found entry for session ${sessionId}, PID: ${entry.pid}, checking health...`);

  // Verify process is still alive (uses cache to avoid expensive checks)
  const isHealthy = await getCachedProcessHealth(sessionId, entry.process, entry.pid);
  if (!isHealthy) {
    // Process is dead, clean up
    console.error(`[getProcessForSession] ❌ Process ${entry.pid} failed health check`);
    console.error(`[getProcessForSession] Process killed: ${entry.process.killed}`);
    console.error(`[getProcessForSession] Process PID: ${entry.pid}`);
    console.error(`[getProcessForSession] Cleaning up session ${sessionId}`);
    activeProcesses.delete(sessionId);
    
    // Update database session status
    try {
      await prisma.localSession.update({
        where: { id: sessionId },
        data: {
          status: "ENDED",
          endedAt: new Date(),
        },
      });
      console.log(`[getProcessForSession] Updated session ${sessionId} status to ENDED`);
    } catch (error) {
      console.error(`[getProcessForSession] Error updating session status:`, error);
    }
    
    return null;
  }

  console.log(`[getProcessForSession] ✅ Process ${entry.pid} is healthy, returning process`);
  return entry.process;
}

/**
 * POST /api/mcp/call
 * 
 * Proxies MCP tool calls to the active MCP server process
 * 
 * Input: {tool: "fs_list", arguments: {path: "...", depth: 1, includeHidden: false}}
 * Output: MCP tool response
 * Auth: Clerk session required
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { tool, arguments: args, sessionId: explicitSessionId } = body;

    if (!tool) {
      return NextResponse.json(
        { error: "Tool name is required" },
        { status: 400 }
      );
    }

    let session;

    // If explicit sessionId provided, use it (for session multiplexer)
    if (explicitSessionId) {
      const dbSession = await prisma.localSession.findFirst({
        where: {
          id: explicitSessionId,
          userId, // Security: ensure user owns the session
          status: "ACTIVE",
        },
      });

      if (!dbSession) {
        return NextResponse.json(
          { error: "Session not found or inactive" },
          { status: 404 }
        );
      }

      session = {
        id: dbSession.id,
        mode: dbSession.mode || null,
        serverType: (dbSession.serverType as "filesystem" | "image-editing") || "filesystem",
        durationMinutes: dbSession.durationMinutes,
        startedAt: dbSession.startedAt,
      };
    } else {
      // Default behavior: route to appropriate session based on tool name
      // For imagen editing tools, find image-editing session
      // For filesystem tools, find filesystem session
      const isImagenEditTool = tool.startsWith("imagen_") && tool !== "imagen_generate";
      
      const cacheKey = isImagenEditTool 
        ? `session:${userId}:image-editing`
        : `session:${userId}:filesystem`;
      
      session = sessionCache.get(cacheKey);

      if (!session) {
        // Cache miss - fetch from database with serverType filter
        const serverType = isImagenEditTool ? "image-editing" : "filesystem";
        
        const dbSession = await prisma.localSession.findFirst({
          where: {
            userId,
            status: "ACTIVE",
            serverType: isImagenEditTool ? "image-editing" : "filesystem",
          },
          orderBy: {
            startedAt: "desc",
          },
        });

        if (!dbSession) {
          const errorMsg = isImagenEditTool
            ? "No active image-editing MCP session found. Please start an Image Editing session first."
            : "No active MCP server session found";
          console.log(`[MCP Call] No active ${serverType} session found for user ${userId}`);
          return NextResponse.json(
            { error: errorMsg },
            { status: 404 }
          );
        }

        // Cache the session for future requests
      session = {
        id: dbSession.id,
        mode: dbSession.mode || null,
        serverType: (dbSession.serverType as "filesystem" | "image-editing") || "filesystem",
        durationMinutes: dbSession.durationMinutes,
        startedAt: dbSession.startedAt,
      };
        sessionCache.set(cacheKey, session);
        console.log(`[MCP Call] ${serverType} session ${session.id} cached for user ${userId}`);
      } else {
        console.log(`[MCP Call] Using cached ${isImagenEditTool ? 'image-editing' : 'filesystem'} session ${session.id} for user ${userId}`);
      }
    }

    // Check if session has expired based on durationMinutes
    if (session.durationMinutes) {
      const sessionStartTime = session.startedAt.getTime();
      const sessionDurationMs = session.durationMinutes * 60 * 1000;
      const now = Date.now();
      const elapsedMs = now - sessionStartTime;

      if (elapsedMs > sessionDurationMs) {
        console.log(`[MCP Call] Session ${session.id} has expired (${session.durationMinutes} min limit exceeded)`);
        
        // Mark session as ended
        try {
          await prisma.localSession.update({
            where: { id: session.id },
            data: {
              status: "ENDED",
              endedAt: new Date(),
            },
          });

          // Invalidate cache (use the same cache key format)
          const cacheKeyToDelete = `session:${userId}:${isImagenEditTool ? 'image-editing' : 'filesystem'}`;
          sessionCache.delete(cacheKeyToDelete);
          healthCache.delete(session.id);
        } catch (error) {
          console.error(`[MCP Call] Error updating expired session:`, error);
        }

        return NextResponse.json(
          {
            error: "Session expired",
            details: `Session expired after ${session.durationMinutes} minutes. Please start a new session.`,
            sessionId: session.id
          },
          { status: 410 } // 410 Gone - resource expired
        );
      }
    }

    console.log(`[MCP Call] Found session ${session.id} for user ${userId}, getting process...`);

    // Get the process for this session (with health check)
    let mcpProcess = await getProcessForSession(session.id);

    if (!mcpProcess) {
      // Process is not available - could be dead, never started, or server restarted
      console.error(`[MCP Call] ❌ Process not available for session ${session.id}`);
      console.error(`[MCP Call] Session details:`);
      console.error(`[MCP Call]   - Session ID: ${session.id}`);
      console.error(`[MCP Call]   - Mode: ${session.mode}`);
      console.error(`[MCP Call]   - Started at: ${session.startedAt}`);
      console.error(`[MCP Call]   - Duration: ${session.durationMinutes || "unlimited"} minutes`);
      console.error(`[MCP Call] Active processes in map: ${Array.from(activeProcesses.keys()).join(", ") || "NONE"}`);
      console.error(`[MCP Call] Total processes in map: ${activeProcesses.size}`);
      console.error(`[MCP Call] ⚠️ ROOT CAUSE ANALYSIS:`);
      console.error(`[MCP Call]   The 'activeProcesses' Map is in-memory and gets cleared when:`);
      console.error(`[MCP Call]   1. Next.js server restarts (common in development)`);
      console.error(`[MCP Call]   2. Server crashes or is redeployed`);
      console.error(`[MCP Call]   3. Process actually exits (handled by exit handler)`);
      console.error(`[MCP Call]   `);
      console.error(`[MCP Call]   ⚠️ IMPORTANT: Even if the MCP process is still running, we lose`);
      console.error(`[MCP Call]   the ChildProcess object reference (stdin/stdout streams).`);
      console.error(`[MCP Call]   Node.js doesn't allow reconnecting to existing process streams.`);
      console.error(`[MCP Call]   `);
      console.error(`[MCP Call]   ✅ SOLUTION: Auto-restart the process (this is expected behavior)`);
      
      // Try to restart the process automatically if we have session info
      // Check serverType instead of mode (image-editing sessions have null mode)
      if (session.serverType) {
        const serverType = session.serverType;
        console.log(`[MCP Call] 🔄 Auto-restarting MCP process for session ${session.id} (serverType: ${serverType}, mode: ${session.mode || "N/A"})...`);
        try {
          const { spawn } = await import("child_process");
          const path = await import("path");
          const os = await import("os");
          
          // Determine MCP server path based on serverType
          let mcpServerPath: string;
          let mcpServerDir: string;
          let spawnArgs: string[];

          if (serverType === "image-editing") {
            mcpServerPath = path.join(process.cwd(), "mcp-server-image-editing", "dist", "index.js");
            mcpServerDir = path.join(process.cwd(), "mcp-server-image-editing");
            spawnArgs = []; // No mode argument for image-editing server
          } else {
            mcpServerPath = path.join(process.cwd(), "mcp-server", "dist", "index.js");
            mcpServerDir = path.join(process.cwd(), "mcp-server");
            spawnArgs = session.mode ? [session.mode] : []; // Pass mode for filesystem server
          }
          
          // Check if MCP server is built
          const fs = await import("fs/promises");
          try {
            await fs.access(mcpServerPath);
          } catch {
            console.error(`[MCP Call] MCP server not built at ${mcpServerPath}`);
            return NextResponse.json(
              { 
                error: "MCP server not available",
                details: `MCP server binary not found. Please rebuild: cd ${serverType === "image-editing" ? "mcp-server-image-editing" : "mcp-server"} && npm run build`,
                sessionId: session.id
              },
              { status: 503 }
            );
          }

          // Start the MCP server process with appropriate environment variables
          const env = {
            ...process.env,
            ...(serverType === "filesystem" && session.mode && { MCP_MODE: session.mode }),
            ...(serverType === "image-editing" && {
              USER_ID: userId,
              OPERASTUDIO_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
            }),
          };

          const restartedProcess = spawn("node", [mcpServerPath, ...spawnArgs], {
            cwd: mcpServerDir,
            env,
            stdio: ["pipe", "pipe", "pipe"],
            detached: false,
          });

          // Wait a moment for process to start
          await new Promise((resolve) => setTimeout(resolve, 500));

          if (!restartedProcess.pid || restartedProcess.killed) {
            console.error(`[MCP Call] Failed to restart process`);
            throw new Error("Process restart failed");
          }

          console.log(`[MCP Call] Successfully restarted process ${restartedProcess.pid} for session ${session.id}`);
          
          // Initialize MCP connection (similar to start route)
          try {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                restartedProcess.stdout?.removeListener("data", onData);
                restartedProcess.stderr?.removeListener("data", onStderr);
                reject(new Error("MCP initialization timeout"));
              }, 5000);

              let responseBuffer = "";
              
              const onStderr = (data: Buffer) => {
                const text = data.toString();
                console.log(`[MCP Call Restart] stderr: ${text.trim()}`);
              };
              
              const onData = (data: Buffer) => {
                const text = data.toString();
                responseBuffer += text;
                
                const lines = responseBuffer.split("\n").filter(line => line.trim());
                for (const line of lines) {
                  try {
                    const response = JSON.parse(line);
                    if (response.id === "init") {
                      clearTimeout(timeout);
                      restartedProcess.stdout?.removeListener("data", onData);
                      restartedProcess.stderr?.removeListener("data", onStderr);
                      if (response.result) {
                        console.log(`[MCP Call Restart] MCP connection initialized`);
                        resolve();
                        return;
                      } else if (response.error) {
                        reject(new Error(`MCP initialization failed: ${response.error.message || JSON.stringify(response.error)}`));
                        return;
                      }
                    }
                  } catch (e) {
                    // Not JSON yet, continue buffering
                  }
                }
              };

              restartedProcess.stdout?.on("data", onData);
              restartedProcess.stderr?.on("data", onStderr);

              setTimeout(() => {
                const initRequest = {
                  jsonrpc: "2.0",
                  id: "init",
                  method: "initialize",
                  params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: {
                      name: "operastudio",
                      version: "1.0.0",
                    },
                  },
                };

                if (restartedProcess.stdin && !restartedProcess.stdin.destroyed) {
                  restartedProcess.stdin.write(JSON.stringify(initRequest) + "\n");
                } else {
                  clearTimeout(timeout);
                  restartedProcess.stdout?.removeListener("data", onData);
                  restartedProcess.stderr?.removeListener("data", onStderr);
                  reject(new Error("MCP process stdin not available"));
                }
              }, 500);
            });
          } catch (initError) {
            console.error(`[MCP Call] Failed to initialize restarted process:`, initError);
            restartedProcess.kill();
            throw new Error(`MCP initialization failed: ${initError instanceof Error ? initError.message : "Unknown error"}`);
          }
          
          // Register the restarted process
          registerMCPProcess(session.id, restartedProcess);
          
          // Re-check process
          mcpProcess = await getProcessForSession(session.id);
          
          if (!mcpProcess) {
            throw new Error("Process restart verification failed");
          }
          
          console.log(`[MCP Call] Process successfully restarted and initialized for session ${session.id}`);
        } catch (restartError) {
          console.error(`[MCP Call] Failed to restart process:`, restartError);
          
          // Clean up stale session
          try {
            await prisma.localSession.update({
              where: { id: session.id },
              data: {
                status: "ENDED",
                endedAt: new Date(),
              },
            });
            console.log(`[MCP Call] Cleaned up stale session ${session.id}`);
          } catch (error) {
            console.error(`[MCP Call] Error cleaning up stale session:`, error);
          }

          const sessionTypeName = serverType === "image-editing" ? "Image Editing" : "File System";
          return NextResponse.json(
            { 
              error: "MCP server process not available",
              details: `The MCP server process has stopped and could not be restarted automatically. Please restart the ${sessionTypeName} session.`,
              sessionId: session.id
            },
            { status: 503 }
          );
        }
      } else {
        // No serverType info, can't restart - clean up
        try {
          await prisma.localSession.update({
            where: { id: session.id },
            data: {
              status: "ENDED",
              endedAt: new Date(),
            },
          });
          console.log(`[MCP Call] Cleaned up stale session ${session.id}`);
        } catch (error) {
          console.error(`[MCP Call] Error cleaning up stale session:`, error);
        }

        return NextResponse.json(
          { 
            error: "MCP server process not available",
            details: "The MCP server process has stopped or crashed. Please restart the session.",
            sessionId: session.id
          },
          { status: 503 }
        );
      }
    }

    console.log(`[MCP Call] Process ${mcpProcess.pid} is available for tool call: ${tool}`);

    // Send JSON-RPC request to MCP server via stdin
    const requestId = Date.now().toString();
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: {
        name: tool,
        arguments: args || {},
      },
    };

    return new Promise((resolve) => {
      let responseBuffer = "";
      let responseReceived = false;
      
      // Capture stderr for debugging
      let stderrBuffer = "";
      const onStderr = (data: Buffer) => {
        const errorText = data.toString();
        stderrBuffer += errorText;
        console.error(`[MCP Call] stderr for request ${requestId}:`, errorText.trim());
      };
      
      // Monitor for process exit during request
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (!responseReceived) {
          responseReceived = true;
          clearTimeout(timeout);
          mcpProcess.stdout?.removeListener("data", onData);
          mcpProcess.stderr?.removeListener("data", onStderr);
          mcpProcess.removeListener("exit", onExit);
          console.error(`[MCP Call] Process exited during request ${requestId}: code=${code}, signal=${signal}`);
          resolve(
            NextResponse.json(
              { 
                error: "MCP server process crashed during request",
                details: `Process exited with code ${code}, signal ${signal}. stderr: ${stderrBuffer.slice(0, 500)}`
              },
              { status: 503 }
            )
          );
        }
      };
      
      // Listen for response on stdout
      const onData = (data: Buffer) => {
        responseBuffer += data.toString();
        
        // Try to parse complete JSON-RPC responses
        const lines = responseBuffer.split("\n").filter(line => line.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === requestId) {
              responseReceived = true;
              clearTimeout(timeout);
              mcpProcess.stdout?.removeListener("data", onData);
              mcpProcess.stderr?.removeListener("data", onStderr);
              mcpProcess.removeListener("exit", onExit);
              
              if (response.error) {
                console.error(`[MCP Call] Tool error for ${tool}:`, response.error);
                resolve(
                  NextResponse.json(
                    { error: response.error.message || "MCP tool error" },
                    { status: 500 }
                  )
                );
              } else {
                // Parse the MCP response content
                const content = response.result?.content?.[0]?.text;
                const isError = response.result?.isError === true;
                
                if (content) {
                  try {
                    const parsed = JSON.parse(content);
                    // If MCP marked it as error, include error flag
                    if (isError) {
                      resolve(NextResponse.json({ 
                        error: parsed.error || "Tool execution failed",
                        ...parsed 
                      }));
                    } else {
                      resolve(NextResponse.json(parsed));
                    }
                  } catch {
                    if (isError) {
                      resolve(NextResponse.json({ error: content }));
                    } else {
                      resolve(NextResponse.json({ result: content }));
                    }
                  }
                } else {
                  resolve(NextResponse.json(response.result || {}));
                }
              }
              return;
            }
          } catch {
            // Not a complete JSON object yet, continue buffering
          }
        }
      };

      // Check if process died before we can send request
      if (mcpProcess.killed || !mcpProcess.pid) {
        clearTimeout(timeout);
        console.error(`[MCP Call] Process died before request could be sent`);
        resolve(
          NextResponse.json(
            { error: "MCP server process died", details: stderrBuffer || "No error details available" },
            { status: 503 }
          )
        );
        return;
      }

      // Determine timeout based on tool type
      // cmd_execute needs longer timeout for installations (5 minutes)
      // Other tools use 30 seconds
      const timeoutMs = tool === "cmd_execute" ? 300000 : 30000;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          responseReceived = true;
          mcpProcess.stdout?.removeListener("data", onData);
          mcpProcess.stderr?.removeListener("data", onStderr);
          mcpProcess.removeListener("exit", onExit);
          console.error(`[MCP Call] Request ${requestId} timed out after ${timeoutMs / 1000}s`);
          resolve(
            NextResponse.json(
              { error: `Request timeout after ${timeoutMs / 1000} seconds` },
              { status: 504 }
            )
          );
        }
      }, timeoutMs);
      
      // Set up listeners
      mcpProcess.stderr?.on("data", onStderr);
      mcpProcess.on("exit", onExit);

      mcpProcess.stdout?.on("data", onData);

      // Send request to stdin
      if (mcpProcess.stdin && !mcpProcess.stdin.destroyed) {
        try {
          mcpProcess.stdin.write(JSON.stringify(jsonRpcRequest) + "\n");
          console.log(`[MCP Call] Sent request ${requestId} for tool ${tool}`);
        } catch (error) {
          clearTimeout(timeout);
          mcpProcess.stdout?.removeListener("data", onData);
          mcpProcess.stderr?.removeListener("data", onStderr);
          mcpProcess.removeListener("exit", onExit);
          console.error(`[MCP Call] Failed to write to stdin:`, error);
          resolve(
            NextResponse.json(
              { error: "Failed to send request to MCP server", details: error instanceof Error ? error.message : "Unknown error" },
              { status: 503 }
            )
          );
        }
      } else {
        clearTimeout(timeout);
        mcpProcess.stdout?.removeListener("data", onData);
        mcpProcess.stderr?.removeListener("data", onStderr);
        mcpProcess.removeListener("exit", onExit);
        console.error(`[MCP Call] stdin not available for request ${requestId}`);
        resolve(
          NextResponse.json(
            { error: "MCP server stdin not available", details: stderrBuffer || "Process may have crashed" },
            { status: 503 }
          )
        );
      }
    });
  } catch (error) {
    console.error("Error calling MCP tool:", error);
    return NextResponse.json(
      { error: "Failed to call MCP tool", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Export function to register a process
export function registerMCPProcess(sessionId: string, process: ChildProcess) {
  if (!process.pid) {
    console.error(`[registerMCPProcess] Cannot register process without PID for session ${sessionId}`);
    return;
  }

  console.log(`[registerMCPProcess] Registering process ${process.pid} for session ${sessionId}`);
  console.log(`[registerMCPProcess] Process stdin available: ${!!process.stdin}, stdout available: ${!!process.stdout}`);
  
  activeProcesses.set(sessionId, { 
    process, 
    sessionId,
    pid: process.pid 
  });
  
  console.log(`[registerMCPProcess] Registered. Active processes: ${Array.from(activeProcesses.keys()).join(", ")}`);
  
  // Clean up when process exits
  process.on("exit", async (code, signal) => {
    console.log(`[registerMCPProcess] MCP process ${process.pid} exited with code ${code}, signal ${signal}`);
    activeProcesses.delete(sessionId);
    healthCache.delete(sessionId); // Clear health cache

    // Update database session status and clear session cache
    try {
      const session = await prisma.localSession.update({
        where: { id: sessionId },
        data: {
          status: "ENDED",
          endedAt: new Date(),
        },
      });

      // Clear session cache for both server types (to be safe)
      const serverType = (session as any).serverType || "filesystem";
      sessionCache.delete(`session:${session.userId}:${serverType}`);
      sessionCache.delete(`session:${session.userId}:filesystem`); // Also clear filesystem cache
      sessionCache.delete(`session:${session.userId}:image-editing`); // Also clear image-editing cache
      console.log(`Updated session ${sessionId} status to ENDED and cleared caches`);
    } catch (error) {
      console.error(`Error updating session ${sessionId} status:`, error);
    }
  });

  // Handle process errors
  process.on("error", async (error) => {
    console.error(`MCP process ${process.pid} error:`, error);
    activeProcesses.delete(sessionId);
    healthCache.delete(sessionId); // Clear health cache

    // Update database session status and clear session cache
    try {
      const session = await prisma.localSession.update({
        where: { id: sessionId },
        data: {
          status: "ENDED",
          endedAt: new Date(),
        },
      });

      // Clear session cache using userId
      sessionCache.delete(`session:${session.userId}`);
      console.log(`Updated session ${sessionId} status to ENDED after error and cleared caches`);
    } catch (dbError) {
      console.error("Error updating session status:", dbError);
    }
  });
}

