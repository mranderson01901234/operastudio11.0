import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/system/info
 * 
 * Returns system information for the user's active MCP session
 * 
 * This endpoint provides system context that can be included in LLM messages
 * to give the LLM full visibility into the user's local environment.
 * 
 * Auth: Clerk session required
 * Output: SystemInfo JSON
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find active session
    const session = await prisma.localSession.findFirst({
      where: {
        userId,
        status: "ACTIVE",
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "No active MCP session found" },
        { status: 404 }
      );
    }

    // Return system info if available
    if (session.systemInfo) {
      return NextResponse.json(session.systemInfo);
    }

    // Fallback: Return basic info if systemInfo not collected yet
    // (for backwards compatibility with existing sessions)
    return NextResponse.json({
      error: "System info not available for this session",
      message: "Please restart your MCP session to collect system information",
    });
  } catch (error) {
    console.error("Error fetching system info:", error);
    return NextResponse.json(
      { error: "Failed to fetch system info", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

