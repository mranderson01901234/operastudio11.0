import { prisma } from "@/lib/prisma";

export interface SessionRoute {
  toolPrefix: string; // "fs_", "imagen_edit_", "imagen_crop", etc.
  sessionId: string;
  serverType: "filesystem" | "image-editing";
}

/**
 * Get routing table for user's active sessions
 * Maps tool prefixes to session IDs for efficient routing
 */
export async function getRoutingTable(
  userId: string
): Promise<Map<string, SessionRoute>> {
  const sessions = await prisma.localSession.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
  });

  const routingTable = new Map<string, SessionRoute>();

  for (const session of sessions) {
    const serverType = (session as any).serverType || "filesystem";

    if (serverType === "filesystem") {
      // Filesystem tools
      routingTable.set("fs_", {
        toolPrefix: "fs_",
        sessionId: session.id,
        serverType: "filesystem",
      });
      routingTable.set("cmd_", {
        toolPrefix: "cmd_",
        sessionId: session.id,
        serverType: "filesystem",
      });
      // Exact matches for filesystem tools
      routingTable.set("fs_read", {
        toolPrefix: "fs_read",
        sessionId: session.id,
        serverType: "filesystem",
      });
      routingTable.set("fs_write", {
        toolPrefix: "fs_write",
        sessionId: session.id,
        serverType: "filesystem",
      });
      routingTable.set("fs_list", {
        toolPrefix: "fs_list",
        sessionId: session.id,
        serverType: "filesystem",
      });
      routingTable.set("fs_delete", {
        toolPrefix: "fs_delete",
        sessionId: session.id,
        serverType: "filesystem",
      });
      routingTable.set("cmd_execute", {
        toolPrefix: "cmd_execute",
        sessionId: session.id,
        serverType: "filesystem",
      });
    } else if (serverType === "image-editing") {
      // Image editing tools - prefix match
      routingTable.set("imagen_edit_", {
        toolPrefix: "imagen_edit_",
        sessionId: session.id,
        serverType: "image-editing",
      });
      // Exact matches for image editing tools
      routingTable.set("imagen_crop", {
        toolPrefix: "imagen_crop",
        sessionId: session.id,
        serverType: "image-editing",
      });
      routingTable.set("imagen_resize", {
        toolPrefix: "imagen_resize",
        sessionId: session.id,
        serverType: "image-editing",
      });
      routingTable.set("imagen_adjust", {
        toolPrefix: "imagen_adjust",
        sessionId: session.id,
        serverType: "image-editing",
      });
      routingTable.set("imagen_filter", {
        toolPrefix: "imagen_filter",
        sessionId: session.id,
        serverType: "image-editing",
      });
      routingTable.set("imagen_rotate", {
        toolPrefix: "imagen_rotate",
        sessionId: session.id,
        serverType: "image-editing",
      });
      routingTable.set("imagen_format", {
        toolPrefix: "imagen_format",
        sessionId: session.id,
        serverType: "image-editing",
      });
    }
  }

  return routingTable;
}

/**
 * Route tool call to appropriate session
 * Returns session ID and server type, or null if no route found
 */
export async function routeToolCall(
  toolName: string,
  userId: string
): Promise<{ sessionId: string; serverType: string } | null> {
  const routingTable = await getRoutingTable(userId);

  // Exact match first (most specific)
  if (routingTable.has(toolName)) {
    const route = routingTable.get(toolName)!;
    return { sessionId: route.sessionId, serverType: route.serverType };
  }

  // Prefix match (less specific, but still works)
  for (const [prefix, route] of routingTable.entries()) {
    if (toolName.startsWith(prefix)) {
      return { sessionId: route.sessionId, serverType: route.serverType };
    }
  }

  return null;
}

/**
 * Check if user has active session for a specific server type
 */
export async function hasActiveSession(
  userId: string,
  serverType: "filesystem" | "image-editing"
): Promise<boolean> {
  const session = await prisma.localSession.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      serverType,
    },
  });

  return !!session;
}

/**
 * Get all active sessions for a user
 */
export async function getActiveSessions(userId: string): Promise<
  Array<{
    id: string;
    serverType: string | null;
    mode: string | null;
    startedAt: Date;
  }>
> {
  const sessions = await prisma.localSession.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      serverType: true,
      mode: true,
      startedAt: true,
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  return sessions;
}

