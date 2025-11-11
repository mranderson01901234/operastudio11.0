/**
 * Test script for HMAC token creation and verification
 * Run with: npx tsx scripts/test-hmac-token.ts
 */

import { createSessionTokenClaims, createToken, verifyToken } from "../lib/utils/hmac-token";

const deviceId = "test-device-123";
const userId = "user_123";
const sessionId = "session_456";
const origin = "https://app.operastudio.com";
const secret = "test-secret-key-base64url";

console.log("=== HMAC Token Test ===\n");

// Test 1: Create token
console.log("Test 1: Create token");
const claims = createSessionTokenClaims(deviceId, userId, sessionId, origin);
const token = createToken(claims, secret);
console.log("Token:", token);
console.log("Claims:", JSON.stringify(claims, null, 2));
console.log("✓ Token created\n");

// Test 2: Verify valid token
console.log("Test 2: Verify valid token");
const verification1 = verifyToken(token, secret, origin);
if (verification1.valid) {
  console.log("✓ Token verified successfully");
  console.log("Claims:", JSON.stringify(verification1.claims, null, 2));
} else {
  console.log("✗ Token verification failed:", verification1.reason);
}
console.log();

// Test 3: Verify with wrong origin
console.log("Test 3: Verify with wrong origin");
const verification2 = verifyToken(token, secret, "https://evil.com");
if (!verification2.valid) {
  console.log("✓ Correctly rejected wrong origin:", verification2.reason);
} else {
  console.log("✗ Should have rejected wrong origin");
}
console.log();

// Test 4: Verify with wrong secret
console.log("Test 4: Verify with wrong secret");
const verification3 = verifyToken(token, "wrong-secret", origin);
if (!verification3.valid) {
  console.log("✓ Correctly rejected wrong secret:", verification3.reason);
} else {
  console.log("✗ Should have rejected wrong secret");
}
console.log();

// Test 5: Create expired token
console.log("Test 5: Create expired token");
const expiredClaims = {
  ...createSessionTokenClaims(deviceId, userId, sessionId, origin),
  exp: Math.floor(Date.now() / 1000) - 100, // Expired 100 seconds ago
};
const expiredToken = createToken(expiredClaims, secret);
const verification4 = verifyToken(expiredToken, secret, origin);
if (!verification4.valid) {
  console.log("✓ Correctly rejected expired token:", verification4.reason);
} else {
  console.log("✗ Should have rejected expired token");
}
console.log();

// Test 6: Replay protection
console.log("Test 6: Replay protection");
const verification5a = verifyToken(token, secret, origin);
const verification5b = verifyToken(token, secret, origin); // Replay
if (verification5a.valid && !verification5b.valid) {
  console.log("✓ Replay protection works");
} else {
  console.log("✗ Replay protection failed");
  console.log("  First verification:", verification5a.valid);
  console.log("  Replay verification:", verification5b.valid);
}
console.log();

console.log("=== Test Complete ===");

