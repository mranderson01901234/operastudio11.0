import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HeartbeatRequest, HeartbeatResponse } from "@/lib/types/device";
import { verifyToken } from "@/lib/utils/hmac-token";

/**
 * POST /api/sessions/heartbeat
 * 
 * Heartbeat endpoint to keep session alive and check revocation status.
 * 
 * Input: {sessionId, sessionToken, origin}
 * Output: {status: "active" | "revoked"}
 * Auth: HMAC session token (no Clerk required)
 * Frequency: Every 30 seconds
 */
export async function POST(request: NextRequest) {
  try {
    // Enforce loopback bind
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] ||
                     request.headers.get("x-real-ip") ||
                     "unknown";
    
    if (clientIp !== "127.0.0.1" && clientIp !== "::1" && !clientIp.startsWith("127.")) {
      return NextResponse.json(
        { error: "Requests must come from localhost" },
        { status: 403 }
      );
    }

    const body: HeartbeatRequest = await request.json();

    if (!body.sessionId || !body.sessionToken || !body.origin) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, sessionToken, origin" },
        { status: 400 }
      );
    }

    // Find session to get secret
    const session = await prisma.localSession.findFirst({
      where: {
        id: body.sessionId,
        status: "ACTIVE",
      },
      include: {
        device: true,
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Verify HMAC token
    const tokenVerification = verifyToken(body.sessionToken, session.sessionSecret, body.origin);
    if (!tokenVerification.valid) {
      return NextResponse.json(
        { error: `Token verification failed: ${tokenVerification.reason}` },
        { status: 401 }
      );
    }

    const claims = tokenVerification.claims!;
    if (claims.sessionId !== body.sessionId) {
      return NextResponse.json({ error: "Session ID mismatch" }, { status: 401 });
    }

    // Check if session or device is revoked
    if (session.status === "REVOKED" || session.device.status === "REVOKED") {
      return NextResponse.json<HeartbeatResponse>({
        status: "revoked",
      });
    }

    // Check if session has ended
    if (session.status === "ENDED") {
      return NextResponse.json({ error: "Session has ended" }, { status: 400 });
    }

    // Update timestamps
    await prisma.$transaction(async (tx) => {
      await tx.localSession.update({
        where: { id: session.id },
        data: {
          updatedAt: new Date(),
        },
      });

      await tx.device.update({
        where: { id: session.deviceId },
        data: {
          lastSeenAt: new Date(),
        },
      });
    });

    return NextResponse.json<HeartbeatResponse>({
      status: "active",
    });
  } catch (error) {
    console.error("Session heartbeat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

