/**
 * Streaming Command Execution API
 *
 * Streams command output in real-time using Server-Sent Events (SSE).
 * This provides live feedback for long-running operations like apt install.
 */

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";

const encoder = new TextEncoder();

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    const { command, args, useSudo, sessionId } = body;

    if (!command || !Array.isArray(args)) {
      return new Response(
        JSON.stringify({ error: "command and args array required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify user has an active session (security check)
    const session = await prisma.localSession.findFirst({
      where: {
        id: sessionId,
        userId,
        status: "ACTIVE",
        serverType: "filesystem",
      },
    });

    if (!session) {
      return new Response(
        JSON.stringify({ error: "No active filesystem session found" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check security mode restrictions
    if (session.mode === "SAFE_MODE") {
      return new Response(
        JSON.stringify({
          error: "Command execution not allowed in Safe Mode",
          details: "Switch to Balanced or Unrestricted mode to execute commands",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        // Prepare command
        const finalCommand = useSudo ? "sudo" : command;
        const finalArgs = useSudo ? [command, ...args] : args;

        console.log(
          `[Stream Command] Executing: ${finalCommand} ${finalArgs.join(" ")}`
        );

        // Spawn process
        const proc = spawn(finalCommand, finalArgs, {
          shell: false,
          env: process.env,
        });

        // Track if we sent any data
        let dataReceived = false;

        // Stream stdout
        proc.stdout.on("data", (data) => {
          dataReceived = true;
          const text = data.toString();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "stdout", data: text })}\n\n`
            )
          );
        });

        // Stream stderr
        proc.stderr.on("data", (data) => {
          dataReceived = true;
          const text = data.toString();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "stderr", data: text })}\n\n`
            )
          );
        });

        // Handle process exit
        proc.on("close", (code, signal) => {
          console.log(
            `[Stream Command] Process exited: code=${code}, signal=${signal}`
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "exit",
                exitCode: code,
                signal,
              })}\n\n`
            )
          );

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        });

        // Handle process error
        proc.on("error", (error) => {
          console.error(`[Stream Command] Process error:`, error);

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: error.message,
              })}\n\n`
            )
          );

          controller.close();
        });

        // Timeout after 5 minutes
        const timeout = setTimeout(() => {
          if (proc.exitCode === null) {
            console.log(
              `[Stream Command] Timeout reached, killing process ${proc.pid}`
            );
            proc.kill();

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  error: "Command execution timeout (5 minutes)",
                })}\n\n`
              )
            );

            controller.close();
          }
        }, 300000); // 5 minutes

        // Clean up timeout when process exits
        proc.on("close", () => clearTimeout(timeout));
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      },
    });
  } catch (error) {
    console.error("[Stream Command] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to execute command",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
