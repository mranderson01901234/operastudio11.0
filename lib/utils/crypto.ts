import crypto from "crypto";

/**
 * Cryptographic utilities for device pairing and HMAC operations
 */

/**
 * Generate a random nonce
 */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Verify HMAC signature
 */
export function verifyHMAC(message: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto.createHmac("sha256", secret).update(message).digest("base64url");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

/**
 * Create HMAC signature
 */
export function createHMAC(message: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("base64url");
}

/**
 * Generate a random session secret (32 bytes)
 */
export function generateSessionSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generate HKDF-derived key from session bootstrap
 */
export function deriveSessionSecret(sessionBootstrap: string, salt: string = "operastudio-session"): string {
  const hkdf = crypto.createHmac("sha256", Buffer.from(salt, "utf8"));
  hkdf.update(Buffer.from(sessionBootstrap, "base64url"));
  return hkdf.digest("base64url");
}

/**
 * Hash arguments for privacy-preserving logging
 */
export function hashArgs(args: Record<string, unknown>): string {
  const json = JSON.stringify(args);
  return crypto.createHash("sha256").update(json).digest("hex");
}

