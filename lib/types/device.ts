/**
 * Device pairing and management types
 */

export type DeviceStatus = "PENDING" | "ACTIVE" | "REVOKED";

export type SessionMode = "SAFE" | "BALANCED" | "UNRESTRICTED";

export type SessionStatus = "ACTIVE" | "ENDED" | "REVOKED";

export type ToolRunStatus = "SUCCESS" | "ERROR" | "CANCELLED";

export interface DeviceMetadata {
  os: "darwin" | "linux" | "win32";
  arch: "amd64" | "arm64";
  hostname: string;
  launcherVersion?: string;
}

export interface PairDeviceRequest {
  deviceMetadata: DeviceMetadata;
}

export interface PairDeviceResponse {
  deviceId: string;
  deviceToken: string; // One-time token for activation
  pairNonce: string; // Nonce for launcher to sign
  expiresAt: number; // Unix timestamp
}

export interface ActivateDeviceRequest {
  deviceId: string;
  deviceToken: string; // One-time token from pair
  publicKey: string; // Ed25519 public key (base64url)
  signature: string; // Signature of pairNonce (base64url)
  origin: string; // Origin from protocol URL
}

export interface ActivateDeviceResponse {
  sessionBootstrap: string; // Short-lived secret for HMAC (base64url)
  expiresAt: number; // Unix timestamp
}

export interface StartSessionRequest {
  deviceId: string; // Device ID (instead of deviceToken)
  sessionSecret: string; // Derived from sessionBootstrap via HKDF
  mcpPort: number;
  mode?: SessionMode;
  durationMinutes?: number;
  origin: string; // Origin for pinning
}

export interface StartSessionResponse {
  sessionId: string;
  sessionToken: string;
}

export interface StopSessionRequest {
  sessionId: string;
  sessionToken: string;
  origin: string;
}

export interface StopSessionResponse {
  receipt: SessionReceipt;
}

export interface HeartbeatRequest {
  sessionId: string;
  sessionToken: string;
  origin: string;
}

export interface HeartbeatResponse {
  status: "active" | "revoked";
}

export interface RevokeDeviceRequest {
  deviceId: string;
}

export interface RevokeDeviceResponse {
  status: "revoked";
}

export interface SessionReceipt {
  sessionId: string;
  duration: number;
  filesChanged: string[];
  commandsExecuted: string[];
  bytesRead: number;
  bytesWritten: number;
  exitCodes: number[];
  elevatedCommands: number;
}

