import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StopSessionRequest, StopSessionResponse, SessionReceipt } from "@/lib/types/device";
import { verifyToken } from "@/lib/utils/hmac-token";

/**
 * POST /api/sessions/stop
 * 
 * Stops a session and generates a receipt.
 * 
 * Input: {sessionId, sessionToken, origin}
 * Output: {receipt}
 * Auth: HMAC session token (no Clerk required)
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

    const body: StopSessionRequest = await request.json();

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
        toolRuns: {
          where: {
            status: "SUCCESS",
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found or already ended" }, { status: 404 });
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

    // Calculate receipt data
    const toolRuns = session.toolRuns;
    const writes = toolRuns.filter((run) => run.tool.startsWith("fs.write"));
    const executions = toolRuns.filter((run) => run.tool.startsWith("exec.run"));
    const elevatedCommands = toolRuns.filter((run) => run.elevated).length;

    const bytesRead = toolRuns.reduce((sum, run) => sum + Number(run.bytesRead), 0);
    const bytesWritten = toolRuns.reduce((sum, run) => sum + Number(run.bytesWritten), 0);

    const duration = session.endedAt
      ? session.endedAt.getTime() - session.startedAt.getTime()
      : Date.now() - session.startedAt.getTime();

    // Extract file paths from write operations (simplified - in production, parse argsHash)
    const filesChanged: string[] = [];
    const commandsExecuted: string[] = [];
    const exitCodes: number[] = [];

    // TODO: Parse argsHash to get actual paths/commands
    // For now, we'll use placeholder data
    writes.forEach((run) => {
      filesChanged.push(`file_${run.id}`); // In production, decode argsHash
    });

    executions.forEach((run) => {
      commandsExecuted.push(`command_${run.id}`); // In production, decode argsHash
      if (run.exitCode !== null) {
        exitCodes.push(run.exitCode);
      }
    });

    const receipt: SessionReceipt = {
      sessionId: session.id,
      duration,
      filesChanged,
      commandsExecuted,
      bytesRead: Number(bytesRead),
      bytesWritten: Number(bytesWritten),
      exitCodes,
      elevatedCommands,
    };

    // Update session status
    await prisma.localSession.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        endedAt: new Date(),
      },
    });

    return NextResponse.json<StopSessionResponse>({
      receipt,
    });
  } catch (error) {
    console.error("Session stop error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

