import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/sessions/status
 * 
 * Check if user has an active session for any of their devices.
 * 
 * Output: {hasActiveSession: boolean, sessionId?: string, deviceId?: string, mode?: string}
 * Auth: Clerk session required (web-only)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find active session for any device owned by this user
    const session = await prisma.localSession.findFirst({
      where: {
        status: "ACTIVE",
        device: {
          userId,
          status: "ACTIVE",
        },
      },
      include: {
        device: true,
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    if (!session) {
      return NextResponse.json({
        hasActiveSession: false,
      });
    }

    // Check if session has expired based on durationMinutes
    if (session.durationMinutes) {
      const sessionStartTime = session.startedAt.getTime();
      const sessionDurationMs = session.durationMinutes * 60 * 1000;
      const now = Date.now();
      const elapsedMs = now - sessionStartTime;

      if (elapsedMs > sessionDurationMs) {
        console.log(`[Session Status] Session ${session.id} has expired (${session.durationMinutes} min limit exceeded)`);
        
        // Mark session as ended
        try {
          await prisma.localSession.update({
            where: { id: session.id },
            data: {
              status: "ENDED",
              endedAt: new Date(),
            },
          });
        } catch (error) {
          console.error(`[Session Status] Error updating expired session:`, error);
        }

        return NextResponse.json({
          hasActiveSession: false,
        });
      }
    }

    return NextResponse.json({
      hasActiveSession: true,
      sessionId: session.id,
      deviceId: session.deviceId,
      mode: session.mode,
      startedAt: session.startedAt.toISOString(),
      deviceName: session.device.deviceName,
    });
  } catch (error) {
    console.error("Session status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

