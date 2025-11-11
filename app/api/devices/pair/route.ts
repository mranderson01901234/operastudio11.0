import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PairDeviceRequest, PairDeviceResponse } from "@/lib/types/device";
import { generateNonce } from "@/lib/utils/crypto";
import * as crypto from "crypto";

/**
 * POST /api/devices/pair
 * 
 * Initiates device pairing from web app. Returns one-time token and nonce for launcher.
 * 
 * Input: {deviceMetadata}
 * Output: {deviceId, deviceToken, pairNonce, expiresAt}
 * Auth: Clerk session required (web-only)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: PairDeviceRequest = await request.json();

    // Validate required fields
    if (!body.deviceMetadata) {
      return NextResponse.json(
        { error: "Missing required fields: deviceMetadata" },
        { status: 400 }
      );
    }

    // Validate device metadata
    const { os, arch, hostname } = body.deviceMetadata;
    if (!["darwin", "linux", "win32"].includes(os)) {
      return NextResponse.json({ error: "Invalid OS" }, { status: 400 });
    }
    if (!["amd64", "arm64"].includes(arch)) {
      return NextResponse.json({ error: "Invalid architecture" }, { status: 400 });
    }
    if (!hostname || hostname.trim().length === 0) {
      return NextResponse.json({ error: "Hostname is required" }, { status: 400 });
    }

    // Generate pair nonce (for launcher to sign)
    const pairNonce = generateNonce();

    // Create device record (status: PENDING until activated)
    const device = await prisma.device.create({
      data: {
        userId,
        deviceName: `${hostname} (${os})`,
        devicePublicKey: "", // Will be set during activation
        status: "PENDING", // Will become ACTIVE after activation
        os: body.deviceMetadata.os,
        arch: body.deviceMetadata.arch,
        hostname: body.deviceMetadata.hostname,
        launcherVersion: body.deviceMetadata.launcherVersion,
        pairedAt: null, // Set after activation
        lastSeenAt: null,
      },
    });

    // Generate one-time device token (expires in 5 minutes)
    const deviceTokenSecret = process.env.DEVICE_TOKEN_SECRET || "dev-secret-change-in-production";
    const deviceTokenPayload = `${device.id}:${userId}:${pairNonce}:${Date.now()}`;
    const deviceToken = crypto
      .createHmac("sha256", deviceTokenSecret)
      .update(deviceTokenPayload)
      .digest("base64url");

    // TODO: Store deviceToken temporarily (Redis or database) with expiration
    // For MVP, we'll return it and validate in activate endpoint
    // In production: Store with deviceId, expiresAt, and validate

    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    console.log("✅ Device paired successfully:", {
      deviceId: device.id,
      deviceName: device.deviceName,
      status: device.status,
    });

    return NextResponse.json<PairDeviceResponse>({
      deviceId: device.id,
      deviceToken,
      pairNonce,
      expiresAt,
    });
  } catch (error) {
    console.error("Device pairing error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

