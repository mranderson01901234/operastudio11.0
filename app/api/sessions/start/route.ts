import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StartSessionRequest, StartSessionResponse } from "@/lib/types/device";
import { createSessionTokenClaims, createToken } from "@/lib/utils/hmac-token";

/**
 * POST /api/sessions/start
 * 
 * Starts a new local session.
 * 
 * Input: {deviceId, sessionSecret, mcpPort, mode?, durationMinutes?, origin}
 * Output: {sessionId, sessionToken}
 * Auth: Device ID (no Clerk required)
 */
export async function POST(request: NextRequest) {
  console.log("=== POST /api/sessions/start ===");
  try {
    const body: StartSessionRequest = await request.json();
    console.log("Session start request:", {
      deviceId: body.deviceId,
      mcpPort: body.mcpPort,
      mode: body.mode,
      durationMinutes: body.durationMinutes,
      origin: body.origin,
    });

    if (!body.deviceId || !body.sessionSecret || !body.mcpPort || !body.origin) {
      return NextResponse.json(
        { error: "Missing required fields: deviceId, sessionSecret, mcpPort, origin" },
        { status: 400 }
      );
    }

    // Enforce loopback bind - only accept requests from localhost
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] ||
                     request.headers.get("x-real-ip") ||
                     "unknown";
    
    if (clientIp !== "127.0.0.1" && clientIp !== "::1" && !clientIp.startsWith("127.")) {
      return NextResponse.json(
        { error: "Requests must come from localhost" },
        { status: 403 }
      );
    }

    // Validate mcpPort range (49152-65535)
    if (body.mcpPort < 49152 || body.mcpPort > 65535) {
      return NextResponse.json(
        { error: "mcpPort must be between 49152 and 65535" },
        { status: 400 }
      );
    }

    // Verify device exists and is active
    const device = await prisma.device.findFirst({
      where: {
        id: body.deviceId,
        status: "ACTIVE",
      },
    });

    if (!device) {
      console.error("❌ Device not found or inactive:", body.deviceId);
      return NextResponse.json({ error: "Device not found or inactive" }, { status: 404 });
    }

    console.log("Device found:", {
      id: device.id,
      status: device.status,
      userId: device.userId,
    });

    const userId = device.userId;

    // Check for existing active session for this device
    const existingSession = await prisma.localSession.findFirst({
      where: {
        deviceId: body.deviceId,
        status: "ACTIVE",
      },
    });

    if (existingSession) {
      return NextResponse.json(
        { error: "Device already has an active session" },
        { status: 409 }
      );
    }

    // Validate mode if provided
    if (body.mode && !["SAFE", "BALANCED", "UNRESTRICTED"].includes(body.mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    // Validate duration for unrestricted mode
    if (body.mode === "UNRESTRICTED") {
      if (!body.durationMinutes || body.durationMinutes < 10 || body.durationMinutes > 30) {
        return NextResponse.json(
          { error: "Unrestricted mode requires durationMinutes between 10 and 30" },
          { status: 400 }
        );
      }
    }

    // Create session
    const session = await prisma.localSession.create({
      data: {
        deviceId: body.deviceId,
        userId,
        sessionSecret: body.sessionSecret, // In production, encrypt this
        mcpPort: body.mcpPort,
        mode: body.mode || null,
        durationMinutes: body.durationMinutes || null,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });

    // Generate HMAC session token with claims
    const claims = createSessionTokenClaims(
      body.deviceId,
      userId,
      session.id,
      body.origin
    );
    
    const token = createToken(claims, body.sessionSecret);

    console.log("✅ Session started:", {
      sessionId: session.id,
      deviceId: session.deviceId,
      mode: session.mode,
      durationMinutes: session.durationMinutes,
    });

    return NextResponse.json<StartSessionResponse>({
      sessionId: session.id,
      sessionToken: token,
    });
  } catch (error) {
    console.error("Session start error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

