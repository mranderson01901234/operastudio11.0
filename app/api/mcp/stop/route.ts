import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getProcessForSession } from "../call/route";

/**
 * POST /api/mcp/stop
 * 
 * Stops the MCP server for the current user's active session
 * 
 * Input: {sessionId?}
 * Output: {success: true, status: "stopped"}
 * Auth: Clerk session required
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId } = body;

    // Find active session
    const session = await prisma.localSession.findFirst({
      where: {
        id: sessionId || undefined,
        userId,
        status: "ACTIVE",
      },
      include: {
        device: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "No active MCP server session found" },
        { status: 404 }
      );
    }

    // Try to get and kill the process
    try {
      const mcpProcess = await getProcessForSession(session.id);
      if (mcpProcess && mcpProcess.pid) {
        console.log(`Killing MCP process ${mcpProcess.pid} for session ${session.id}`);
        mcpProcess.kill("SIGTERM");
        
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!mcpProcess.killed && mcpProcess.pid) {
            console.log(`Force killing MCP process ${mcpProcess.pid}`);
            mcpProcess.kill("SIGKILL");
          }
        }, 5000);
      }
    } catch (error) {
      console.error("Error killing MCP process:", error);
      // Continue with database update even if process kill fails
    }

    // Update session status
    await prisma.localSession.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        endedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      status: "stopped",
      message: "MCP server stopped successfully",
    });
  } catch (error) {
    console.error("Error stopping MCP server:", error);
    return NextResponse.json(
      { error: "Failed to stop MCP server" },
      { status: 500 }
    );
  }
}

