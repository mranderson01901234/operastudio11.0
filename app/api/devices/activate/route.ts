import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ActivateDeviceRequest, ActivateDeviceResponse } from "@/lib/types/device";
import { verifyHMAC, generateSessionSecret } from "@/lib/utils/crypto";
import * as crypto from "crypto";

/**
 * POST /api/devices/activate
 * 
 * Activates a device after pairing. Called by launcher with one-time device_token.
 * 
 * Input: {deviceId, deviceToken, publicKey, signature, origin}
 * Output: {sessionBootstrap, expiresAt}
 * Auth: One-time device token (no Clerk required)
 */
export async function POST(request: NextRequest) {
  console.log("=== POST /api/devices/activate ===");
  try {
    const body: ActivateDeviceRequest = await request.json();
    console.log("Activation request:", {
      deviceId: body.deviceId,
      hasPublicKey: !!body.publicKey,
      hasSignature: !!body.signature,
      origin: body.origin,
    });

    // Validate required fields
    if (!body.deviceId || !body.deviceToken || !body.publicKey || !body.signature || !body.origin) {
      return NextResponse.json(
        { error: "Missing required fields: deviceId, deviceToken, publicKey, signature, origin" },
        { status: 400 }
      );
    }

    // Find device and verify one-time token
    // In production, deviceToken should be stored temporarily and validated
    // For MVP, we'll verify it matches the device
    const device = await prisma.device.findFirst({
      where: {
        id: body.deviceId,
        status: {
          not: "REVOKED",
        },
      },
      include: {
        deviceKeys: {
          where: {
            revokedAt: null,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    if (!device) {
      console.error("❌ Device not found:", body.deviceId);
      return NextResponse.json({ error: "Device not found or revoked" }, { status: 404 });
    }

    console.log("Device found:", {
      id: device.id,
      status: device.status,
      userId: device.userId,
      hasPublicKey: !!device.devicePublicKey,
    });

    // TODO: Verify one-time device_token (should be stored temporarily)
    // For MVP, we'll accept any deviceToken for the device
    // In production: Check if deviceToken exists in temporary storage and hasn't expired

    // Check if device already has a public key (already activated)
    if (device.devicePublicKey && device.devicePublicKey !== "") {
      // Update existing device with new public key if different
      if (device.devicePublicKey !== body.publicKey) {
        await prisma.device.update({
          where: { id: device.id },
          data: { devicePublicKey: body.publicKey },
        });
      }
    } else {
      // Store public key
      await prisma.device.update({
        where: { id: device.id },
        data: { devicePublicKey: body.publicKey },
      });
    }

    // Store public key in device_keys table
    await prisma.deviceKey.create({
      data: {
        deviceId: device.id,
        publicKey: body.publicKey,
        privateKeyEncrypted: "", // Not stored on backend
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      },
    });

    // TODO: Verify signature of pairNonce
    // Expected: Ed25519 signature of pairNonce using devicePrivateKey
    // For MVP, we'll verify the signature format
    if (!body.signature || body.signature.length < 32) {
      return NextResponse.json({ error: "Invalid signature format" }, { status: 400 });
    }

    // Generate session bootstrap secret (short-lived, 5 minutes)
    const sessionBootstrap = generateSessionSecret();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // TODO: Store sessionBootstrap temporarily (Redis or database)
    // For MVP, we'll return it directly
    // In production: Store with deviceId, expiresAt, and validate on session start

    // Update device status to ACTIVE if it was PENDING
    if (device.status === "PENDING") {
      await prisma.device.update({
        where: { id: device.id },
        data: {
          status: "ACTIVE",
          pairedAt: new Date(),
          lastSeenAt: new Date(),
        },
      });
      console.log("✅ Device activated: PENDING -> ACTIVE");
    } else {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      });
      console.log("✅ Device reactivated (was already ACTIVE)");
    }

    console.log("✅ Activation complete, returning sessionBootstrap");

    return NextResponse.json<ActivateDeviceResponse>({
      sessionBootstrap,
      expiresAt,
    });
  } catch (error) {
    console.error("Device activation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

