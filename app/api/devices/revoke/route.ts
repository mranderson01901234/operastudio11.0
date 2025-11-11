import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { RevokeDeviceRequest, RevokeDeviceResponse } from "@/lib/types/device";

/**
 * POST /api/devices/revoke
 * 
 * Revokes a device, ending all active sessions.
 * 
 * Input: {deviceId}
 * Output: {status: "revoked"}
 * Auth: Clerk session required (user revokes own device)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: RevokeDeviceRequest = await request.json();

    if (!body.deviceId) {
      return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
    }

    // Verify device belongs to user
    const device = await prisma.device.findFirst({
      where: {
        id: body.deviceId,
        userId,
      },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    if (device.status === "REVOKED") {
      return NextResponse.json({ error: "Device already revoked" }, { status: 400 });
    }

    // Revoke device and all active sessions
    await prisma.$transaction(async (tx) => {
      // Revoke device
      await tx.device.update({
        where: { id: device.id },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revocationReason: "user",
        },
      });

      // End all active sessions
      await tx.localSession.updateMany({
        where: {
          deviceId: device.id,
          status: "ACTIVE",
        },
        data: {
          status: "REVOKED",
          endedAt: new Date(),
        },
      });
    });

    return NextResponse.json<RevokeDeviceResponse>({
      status: "revoked",
    });
  } catch (error) {
    console.error("Device revocation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

