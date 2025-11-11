import * as crypto from "crypto";
import { createHMAC, verifyHMAC } from "./crypto";

/**
 * HMAC Token utilities with claims, TTL, replay protection, and origin pinning
 */

export interface TokenClaims {
  iss: string; // Device ID (issuer)
  aud: string; // Backend (audience)
  userId: string;
  sessionId: string;
  origin: string;
  iat: number; // Issued at (Unix timestamp)
  exp: number; // Expires at (Unix timestamp)
  nonce: string; // Random nonce for replay protection
}

const REPLAY_WINDOW_MS = 10 * 1000; // 10 seconds
const CLOCK_SKEW_MS = 30 * 1000; // ±30 seconds
const TOKEN_TTL_MS = 60 * 1000; // 60 seconds

// In-memory nonce cache for replay protection (in production, use Redis)
const nonceCache = new Map<string, number>();

/**
 * Create HMAC token with claims
 */
export function createToken(claims: TokenClaims, secret: string): string {
  const claimsJson = JSON.stringify(claims);
  const signature = createHMAC(claimsJson, secret);
  return `${Buffer.from(claimsJson).toString("base64url")}.${signature}`;
}

/**
 * Verify and parse HMAC token
 */
export function verifyToken(
  token: string,
  secret: string,
  expectedOrigin: string
): { valid: boolean; claims?: TokenClaims; reason?: string } {
  try {
    const [claimsB64, signature] = token.split(".");
    if (!claimsB64 || !signature) {
      return { valid: false, reason: "Invalid token format" };
    }

    // Decode claims
    const claimsJson = Buffer.from(claimsB64, "base64url").toString("utf8");
    const claims: TokenClaims = JSON.parse(claimsJson);

    // Verify signature
    const expectedSignature = createHMAC(claimsJson, secret);
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return { valid: false, reason: "Invalid signature" };
    }

    // Verify origin pinning
    if (claims.origin !== expectedOrigin) {
      return { valid: false, reason: "Origin mismatch" };
    }

    // Check expiration with clock skew tolerance
    const now = Date.now();
    const expMs = claims.exp * 1000;
    const iatMs = claims.iat * 1000;

    if (expMs < now - CLOCK_SKEW_MS) {
      return { valid: false, reason: "Token expired" };
    }

    if (iatMs > now + CLOCK_SKEW_MS) {
      return { valid: false, reason: "Token issued in future" };
    }

    // Check replay window
    const nonceKey = `${claims.iss}:${claims.nonce}`;
    const nonceTime = nonceCache.get(nonceKey);
    const nowSeconds = Math.floor(now / 1000);

    if (nonceTime) {
      // Nonce seen before, check if within replay window
      const ageSeconds = nowSeconds - nonceTime;
      if (ageSeconds < 10) {
        return { valid: false, reason: "Token replayed" };
      }
    }

    // Record nonce (keep for replay window duration)
    nonceCache.set(nonceKey, nowSeconds);
    
    // Clean up old nonces (older than replay window)
    setTimeout(() => {
      nonceCache.delete(nonceKey);
    }, REPLAY_WINDOW_MS);

    return { valid: true, claims };
  } catch (error) {
    return { valid: false, reason: "Token parse error" };
  }
}

/**
 * Create token claims for session
 */
export function createSessionTokenClaims(
  deviceId: string,
  userId: string,
  sessionId: string,
  origin: string
): TokenClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: deviceId,
    aud: "operastudio-backend",
    userId,
    sessionId,
    origin,
    iat: now,
    exp: now + 60, // 60 second TTL
    nonce: crypto.randomBytes(16).toString("base64url"),
  };
}

