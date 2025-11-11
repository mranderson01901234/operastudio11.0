/**
 * Helper functions to check MCP session status
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Check if user has an active MCP session
 * By default checks for filesystem sessions (for file system tools and cmd_execute)
 * Can optionally check for specific serverType
 */
export async function hasActiveMCPSession(
  userId: string,
  serverType: "filesystem" | "image-editing" = "filesystem"
): Promise<boolean> {
  try {
    const session = await prisma.localSession.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        serverType, // Filter by serverType to match MCP call route behavior
      },
    });

    return !!session;
  } catch (error) {
    console.error("Error checking MCP session:", error);
    return false;
  }
}

/**
 * Get MCP session status for current user
 */
export async function getMCPSessionStatus(): Promise<{
  hasActiveSession: boolean;
  sessionId: string | null;
}> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { hasActiveSession: false, sessionId: null };
    }

    const session = await prisma.localSession.findFirst({
      where: {
        userId,
        status: "ACTIVE",
      },
    });

    return {
      hasActiveSession: !!session,
      sessionId: session?.id || null,
    };
  } catch (error) {
    console.error("Error getting MCP session status:", error);
    return { hasActiveSession: false, sessionId: null };
  }
}

