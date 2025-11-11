import { prisma } from "@/lib/prisma";
import { verifyHMAC } from "./crypto";

/**
 * Device token verification utilities
 * 
 * In production, device tokens should be JWTs or similar signed tokens.
 * For MVP, we'll use HMAC-based tokens with device lookup.
 */

const DEVICE_TOKEN_SECRET = process.env.DEVICE_TOKEN_SECRET || "dev-secret-change-in-production";

export interface VerifiedDeviceToken {
  deviceId: string;
  userId: string;
  isValid: boolean;
}

/**
 * Verify device token and return device info
 * 
 * In production, this should verify a JWT or similar signed token.
 * For MVP, we'll do a simple lookup.
 */
export async function verifyDeviceToken(deviceToken: string): Promise<VerifiedDeviceToken | null> {
  try {
    // TODO: Implement proper JWT verification
    // For MVP, we'll use a simple approach:
    // 1. Device token contains deviceId (in production, use JWT)
    // 2. Look up device and verify it's active
    
    // For now, return null to indicate this needs implementation
    // In production, decode JWT and verify signature
    return null;
  } catch (error) {
    console.error("Device token verification error:", error);
    return null;
  }
}

/**
 * Create device token (for use after pairing)
 * 
 * In production, this should create a JWT.
 */
export function createDeviceToken(deviceId: string, userId: string): string {
  const payload = `${deviceId}:${userId}:${Date.now()}`;
  return Buffer.from(payload).toString("base64url");
}

/**
 * Parse device token (for MVP - in production, decode JWT)
 */
export function parseDeviceToken(deviceToken: string): { deviceId: string; userId: string } | null {
  try {
    const decoded = Buffer.from(deviceToken, "base64url").toString("utf-8");
    const [deviceId, userId] = decoded.split(":");
    if (deviceId && userId) {
      return { deviceId, userId };
    }
    return null;
  } catch {
    return null;
  }
}

