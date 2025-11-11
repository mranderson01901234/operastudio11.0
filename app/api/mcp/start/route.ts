import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as os from "os";
import { registerMCPProcess, getProcessForSession } from "../call/route";
import { collectSystemInfo } from "@/lib/mcp/system-info";

/**
 * Initialize MCP connection by sending initialize request
 */
async function initializeMCPConnection(process: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      process.stdout?.removeListener("data", onData);
      process.stderr?.removeListener("data", onStderr);
      console.error(`[MCP Start] Initialization timeout after 5s`);
      reject(new Error("MCP initialization timeout"));
    }, 5000);

    let responseBuffer = "";
    let stderrBuffer = "";
    
    const onStderr = (data: Buffer) => {
      const text = data.toString();
      stderrBuffer += text;
      console.log(`[MCP Start] stderr during init: ${text.trim()}`);
    };
    
    const onData = (data: Buffer) => {
      const text = data.toString();
      responseBuffer += text;
      console.log(`[MCP Start] stdout during init: ${text.trim()}`);
      
      const lines = responseBuffer.split("\n").filter(line => line.trim());
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          console.log(`[MCP Start] Parsed response:`, JSON.stringify(response));
          if (response.id === "init") {
            clearTimeout(timeout);
            process.stdout?.removeListener("data", onData);
            process.stderr?.removeListener("data", onStderr);
            if (response.result) {
              console.log(`[MCP Start] MCP connection initialized successfully`);
              resolve();
            } else if (response.error) {
              console.error(`[MCP Start] Initialize error:`, response.error);
              reject(new Error(`MCP initialization failed: ${response.error.message || JSON.stringify(response.error)}`));
            }
            return;
          }
        } catch (e) {
          // Not JSON yet, continue buffering
        }
      }
    };

    process.stdout?.on("data", onData);
    process.stderr?.on("data", onStderr);

    // Wait a moment for server to be ready
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

      if (process.stdin && !process.stdin.destroyed) {
        const requestStr = JSON.stringify(initRequest) + "\n";
        console.log(`[MCP Start] Sending initialize request: ${requestStr.trim()}`);
        process.stdin.write(requestStr);
      } else {
        clearTimeout(timeout);
        process.stdout?.removeListener("data", onData);
        process.stderr?.removeListener("data", onStderr);
        reject(new Error("MCP process stdin not available"));
      }
    }, 500); // Wait 500ms for server to start
  });
}

/**
 * POST /api/mcp/start
 * 
 * Starts the MCP server with the specified security mode
 * 
 * Input: {mode, durationMinutes?}
 * Output: {port, processId, status: "started"}
 * Auth: Clerk session required
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { mode, durationMinutes, serverType = "filesystem" } = body;

    // Validate serverType
    if (!["filesystem", "image-editing"].includes(serverType)) {
      return NextResponse.json(
        { error: "Invalid serverType. Must be 'filesystem' or 'image-editing'" },
        { status: 400 }
      );
    }

    // Validate mode (only required for filesystem)
    if (serverType === "filesystem") {
      if (!mode || !["SAFE", "BALANCED", "UNRESTRICTED"].includes(mode)) {
        return NextResponse.json(
          { error: "Invalid mode. Must be SAFE, BALANCED, or UNRESTRICTED" },
          { status: 400 }
        );
      }
    }

    // Duration is optional - if provided, use it; otherwise session doesn't expire
    // No validation needed - durationMinutes can be null/undefined for unlimited sessions

    // Check for existing MCP server session for this user AND serverType
    // Allow multiple sessions if different serverType (filesystem + image-editing)
    const existingSession = await prisma.localSession.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        serverType, // Check for same serverType
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    if (existingSession) {
      // Also verify if process actually exists and is healthy
      const existingProcess = await getProcessForSession(existingSession.id);
      
      if (existingProcess && !existingProcess.killed && existingProcess.pid) {
        // Process exists and is running - don't start a new one
        console.log(`[MCP Start] Session ${existingSession.id} already has active process ${existingProcess.pid}`);
        return NextResponse.json(
          { 
            error: "MCP server already running for this user",
            sessionId: existingSession.id,
            processId: existingProcess.pid,
          },
          { status: 409 }
        );
      } else {
        // Database says ACTIVE but process is dead - clean up stale session first
        console.log(`[MCP Start] Found stale session ${existingSession.id}, cleaning up...`);
        try {
          await prisma.localSession.update({
            where: { id: existingSession.id },
            data: {
              status: "ENDED",
              endedAt: new Date(),
            },
          });
          console.log(`[MCP Start] Cleaned up stale session ${existingSession.id}`);
        } catch (cleanupError) {
          console.error(`[MCP Start] Error cleaning up stale session:`, cleanupError);
          // Continue anyway - we'll start a new session
        }
      }
    }

    // Determine MCP server path based on serverType
    let mcpServerPath: string;
    let mcpServerDir: string;
    let spawnArgs: string[];

    if (serverType === "image-editing") {
      // Image editing MCP server (will be created in Phase 3)
      mcpServerPath = path.join(
        process.cwd(),
        "mcp-server-image-editing",
        "dist",
        "index.js"
      );
      mcpServerDir = path.join(process.cwd(), "mcp-server-image-editing");
      spawnArgs = []; // No mode argument for image-editing server
    } else {
      // Filesystem MCP server (existing)
      mcpServerPath = path.join(process.cwd(), "mcp-server", "dist", "index.js");
      mcpServerDir = path.join(process.cwd(), "mcp-server");
      spawnArgs = [mode]; // Pass mode for filesystem server
    }

    // Check if MCP server is built
    const fs = await import("fs/promises");
    try {
      await fs.access(mcpServerPath);
    } catch {
      return NextResponse.json(
        {
          error: `MCP server not built. Run: cd ${serverType === "image-editing" ? "mcp-server-image-editing" : "mcp-server"} && npm run build`,
        },
        { status: 500 }
      );
    }

    // Set environment variables
    const env = {
      ...process.env,
      ...(serverType === "filesystem" && { MCP_MODE: mode }),
      ...(serverType === "image-editing" && {
        USER_ID: userId,
        OPERASTUDIO_API_URL:
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
      }),
    };

    // Start the MCP server process
    const mcpProcess = spawn("node", [mcpServerPath, ...spawnArgs], {
      cwd: mcpServerDir,
      env,
      stdio: ["pipe", "pipe", "pipe"], // stdin, stdout, stderr
      detached: false,
    });

    // Track if process started successfully
    let processStarted = false;
    let startupError: Error | null = null;
    let stderrBuffer = "";

    // Capture stderr to see what errors the MCP server is producing
    mcpProcess.stderr?.on("data", (data: Buffer) => {
      const errorText = data.toString();
      stderrBuffer += errorText;
      console.error(`[MCP Server stderr] ${errorText.trim()}`);
    });

    // Handle process errors (spawn failures)
    mcpProcess.on("error", async (error) => {
      console.error(`[MCP Start] Process spawn error:`, error);
      console.error(`[MCP Start] stderr output:`, stderrBuffer);
      startupError = error;
      
      // Clean up session if it was created
      if (processStarted) {
        try {
          const session = await prisma.localSession.findFirst({
            where: { userId, status: "ACTIVE" },
            orderBy: { startedAt: "desc" },
          });
          if (session) {
            await prisma.localSession.update({
              where: { id: session.id },
              data: { status: "ENDED", endedAt: new Date() },
            });
          }
        } catch (cleanupError) {
          console.error("Error cleaning up failed session:", cleanupError);
        }
      }
    });

    // Handle early exit (process crashes immediately)
    mcpProcess.on("exit", async (code, signal) => {
      if (!processStarted && code !== null && code !== 0) {
        console.error(`[MCP Start] Process exited immediately with code ${code}, signal ${signal}`);
        console.error(`[MCP Start] stderr output:`, stderrBuffer);
        startupError = new Error(`Process exited with code ${code}. stderr: ${stderrBuffer.slice(0, 500)}`);
        
        // Clean up session
        try {
          const session = await prisma.localSession.findFirst({
            where: { userId, status: "ACTIVE" },
            orderBy: { startedAt: "desc" },
          });
          if (session) {
            await prisma.localSession.update({
              where: { id: session.id },
              data: { status: "ENDED", endedAt: new Date() },
            });
          }
        } catch (cleanupError) {
          console.error("Error cleaning up crashed session:", cleanupError);
        }
      } else if (processStarted) {
        console.log(`MCP server process exited with code ${code}, signal ${signal}`);
      }
    });

    // Wait a moment to check if process starts successfully
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Check if process is still alive after startup delay
    if (!mcpProcess.pid || mcpProcess.killed) {
      const errorMsg = startupError?.message || "MCP server process failed to start";
      console.error(`[MCP Start] Process failed: ${errorMsg}`);
      console.error(`[MCP Start] stderr: ${stderrBuffer}`);
      throw new Error(`${errorMsg}. Check server logs for details.`);
    }

    // Log successful startup
    console.log(`[MCP Start] Process ${mcpProcess.pid} started successfully in ${mode} mode`);

    processStarted = true;

    // Generate random port for MCP server (we'll use stdio for now, but can add HTTP later)
    const mcpPort = 49152 + Math.floor(Math.random() * 1000);

    // Create or find device for this user (simplified - no pairing needed)
    let device = await prisma.device.findFirst({
      where: {
        userId,
        status: "ACTIVE",
      },
    });

    if (!device) {
      // Create a simple device record for MCP sessions
      device = await prisma.device.create({
        data: {
          userId,
          deviceName: "MCP Server",
          devicePublicKey: "",
          status: "ACTIVE",
          os: process.platform,
          arch: process.arch,
          hostname: os.hostname(),
          launcherVersion: null, // No longer using Electron launcher
          pairedAt: new Date(),
          lastSeenAt: new Date(),
        },
      });
    }

    // Create session record
    const session = await prisma.localSession.create({
      data: {
        deviceId: device.id,
        userId,
        sessionSecret: `mcp-${Date.now()}`, // Simple secret for now
        mcpPort,
        mode: serverType === "filesystem" ? mode : null, // Only set mode for filesystem
        serverType, // Store serverType for routing
        durationMinutes: durationMinutes || null, // Optional for all modes
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });

    // Collect system information for this session
    // This provides the LLM with full context about the user's system
    // Includes proactive software discovery (browsers, tools)
    try {
      const systemInfo = await collectSystemInfo();
      await prisma.localSession.update({
        where: { id: session.id },
        data: {
          systemInfo: systemInfo as any, // Prisma JSON type
        },
      });
      console.log(`[MCP Start] Collected system info for session ${session.id}`);
      if (systemInfo.installedSoftware?.browsers.length) {
        console.log(`[MCP Start] Discovered browsers: ${systemInfo.installedSoftware.browsers.join(", ")}`);
      }
    } catch (error) {
      // Don't fail session creation if system info collection fails
      console.error(`[MCP Start] Failed to collect system info:`, error);
    }

    // Initialize MCP connection before registering
    await initializeMCPConnection(mcpProcess);

    // Register the process so we can communicate with it
    registerMCPProcess(session.id, mcpProcess);

    // Verify process is still alive after registration
    const verifyProcess = await getProcessForSession(session.id);
    if (!verifyProcess) {
      console.error(`[MCP Start] Process ${mcpProcess.pid} died immediately after registration!`);
      throw new Error("MCP server process died immediately after starting. Check server logs for errors.");
    }

    console.log(`[MCP Start] Successfully registered and verified process ${mcpProcess.pid} for session ${session.id}`);

    // Invalidate cache in /api/mcp/call to ensure new session is found immediately
    // Import the cache from call route (it's exported for this purpose)
    try {
      const { invalidateSessionCache } = await import("../call/route");
      if (invalidateSessionCache) {
        invalidateSessionCache(userId, serverType);
        console.log(`[MCP Start] Invalidated cache for ${serverType} session`);
      }
    } catch (error) {
      // Cache invalidation is best-effort, don't fail if it doesn't work
      console.warn(`[MCP Start] Could not invalidate cache (non-fatal):`, error);
    }

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      processId: mcpProcess.pid,
      mode,
      status: "started",
      message: "MCP server started successfully",
    });
  } catch (error) {
    console.error("Error starting MCP server:", error);
    return NextResponse.json(
      { error: "Failed to start MCP server", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

