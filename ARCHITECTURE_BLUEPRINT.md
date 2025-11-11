# Architecture Blueprint: Local Environment Connector

**Version:** 2.0  
**Date:** 2025-01-27  
**Status:** Implementation-Ready

---

## Table of Contents

1. [System Diagram with Trust Boundaries](#1-system-diagram-with-trust-boundaries)
2. [Protocol Handler and Launcher Specification](#2-protocol-handler-and-launcher-specification)
3. [Device Pairing Flow](#3-device-pairing-flow)
4. [Local Session Lifecycle](#4-local-session-lifecycle)
5. [HMAC Transport Details](#5-hmac-transport-details)
6. [MCP Façade Contract](#6-mcp-façade-contract)
7. [Policy Engine in Launcher](#7-policy-engine-in-launcher)
8. [Working Directory and Selection Model](#8-working-directory-and-selection-model)
9. [Consent UX and Enforcement Point](#9-consent-ux-and-enforcement-point)
10. [Audit, Receipts, and Observability](#10-audit-receipts-and-observability)
11. [Backend Integration](#11-backend-integration)
12. [UX Script](#12-ux-script)
13. [Acceptance Criteria](#13-acceptance-criteria)
14. [Finalized Decisions](#14-finalized-decisions)

---

## 1. System Diagram with Trust Boundaries

### 1.1 Component Topology

**Trust Boundary 1: Browser → Backend API**
- **Boundary Type:** Network (HTTPS)
- **Authentication:** Clerk session token (JWT)
- **Authorization:** Clerk `userId` + rate limits
- **Transport:** HTTPS with TLS 1.3
- **Components:**
  - Browser UI (Next.js React app)
  - Backend API (`/api/*` routes)
  - Clerk authentication service

**Trust Boundary 2: Backend API → Protocol Launcher**
- **Boundary Type:** Protocol handler invocation
- **Authentication:** HMAC-signed nonce in protocol URL
- **Authorization:** Nonce validation + PKCE proof
- **Transport:** Custom protocol scheme (`operastudio://`)
- **Components:**
  - Backend API (nonce issuer)
  - OS protocol handler
  - Launcher binary (signed, verified)

**Trust Boundary 3: Launcher → Local MCP Server**
- **Boundary Type:** Process boundary (localhost)
- **Authentication:** Per-session HMAC secret
- **Authorization:** Mode-based policy engine
- **Transport:** WebSocket/HTTP on `127.0.0.1` (random high port)
- **Components:**
  - Launcher process (policy enforcer)
  - MCP server process (tool executor)
  - Child processes (commands, file ops)

**Trust Boundary 4: Backend API ↔ Launcher (Session)**
- **Boundary Type:** Network (localhost loopback)
- **Authentication:** HMAC-signed tokens
- **Authorization:** Session token + device token
- **Transport:** WebSocket/HTTP on `127.0.0.1`
- **Components:**
  - Backend API (tool call proxy)
  - Launcher (MCP proxy + policy)
  - MCP server (actual execution)

### 1.2 Authentication & Consent Enforcement Points

**Point 1: Browser → Backend**
- **Who:** Clerk validates user session
- **What:** `userId` extracted from Clerk JWT
- **When:** Every API request
- **Consent:** User logged in = consent to use app

**Point 2: Backend → Launcher (Pairing)**
- **Who:** Backend validates nonce + PKCE proof
- **What:** Device token issued after proof
- **When:** Initial pairing only
- **Consent:** User clicks "Connect" = consent to pair device

**Point 3: Launcher → MCP Server**
- **Who:** Launcher validates session token
- **What:** Mode-based policy enforcement
- **When:** Every tool call
- **Consent:** Mode selection = consent level (Safe/Balanced/Unrestricted)

**Point 4: MCP Server → File System/Commands**
- **Who:** OS enforces file permissions
- **What:** User-level permissions (no elevation unless requested)
- **When:** Every file/exec operation
- **Consent:** OS prompt for elevation (if needed)

### 1.3 Data Flow Diagram (Text)

```
[Browser UI]
    │ (HTTPS + Clerk JWT)
    ▼
[Backend API]
    │ (Protocol: operastudio://connect?nonce=...)
    ▼
[OS Protocol Handler]
    │ (Launches signed binary)
    ▼
[Launcher Binary]
    │ (Validates nonce, starts MCP server)
    │ (HMAC secret exchange)
    ▼
[MCP Server Process]
    │ (Tool execution: fs.*, exec.*, git.*)
    ▼
[File System / Commands]
    │ (OS permissions enforced)
    ▼
[Results]
    │ (Streamed back via MCP → Launcher → Backend → SSE)
    ▼
[Browser UI]
```

---

## 2. Protocol Handler and Launcher Specification

### 2.1 Protocol Scheme

**Scheme:** `operastudio://`

**URL Format:**
- `operastudio://connect?nonce={nonce}&user={userId}&session={sessionId}&origin={appOrigin}`

**Parameters:**
- `nonce`: HMAC-signed nonce (60s TTL, single-use)
- `user`: Clerk `userId` (for display/validation)
- `session`: Backend session ID (optional, for resume)
- `origin`: App origin (for origin pinning)

**OS Registration:**
- macOS: `Info.plist` CFBundleURLSchemes
- Linux: `.desktop` file MimeType
- Windows: Registry `HKEY_CLASSES_ROOT\operastudio`

### 2.2 Launcher Binary Specification

**Binary Name:** `operastudio-launcher`

**Platform Targets:**
- macOS: Universal binary (arm64 + x86_64)
- Linux: Static binary (amd64, arm64)
- Windows: PE executable (amd64)

**Code Signing:**
- macOS: Notarized by Apple (Developer ID)
- Windows: Signed with EV certificate
- Linux: GPG signature + checksum

**Installation Location:**
- macOS: `~/Library/Application Support/OperaStudio/launcher`
- Linux: `~/.local/bin/operastudio-launcher`
- Windows: `%LOCALAPPDATA%\OperaStudio\launcher.exe`

**First-Run OS Prompts:**
- macOS: Gatekeeper verification → "Open" confirmation
- Linux: Executable permission prompt (if needed)
- Windows: SmartScreen → "Run anyway" (first time)

### 2.3 Launcher Responsibilities

**1. Nonce Validation**
- Verify HMAC signature on nonce
- Check TTL (60s window)
- Verify origin matches app domain
- Reject if expired/replayed/origin mismatch

**2. MCP Server Lifecycle**
- Start MCP server on `127.0.0.1` (random port 49152-65535)
- Generate per-session HMAC secret
- Exchange secret with backend via secure channel
- Monitor MCP server health
- Terminate on session end/crash

**3. Mode/Policy Enforcement**
- Display mode selection UI (Safe/Balanced/Unrestricted)
- Enforce policy per tool call
- Show consent dialogs (Safe/Balanced modes)
- Log all policy decisions

**4. Health Endpoint**
- Expose `GET /health` on localhost
- Return: `{status, version, sessionId, uptime, mode}`
- Used by backend for heartbeat

**5. Crash Recovery**
- Watchdog process monitors launcher
- Auto-restart on crash (max 3 attempts)
- Log crash events to audit log
- Notify backend on recovery

**6. Logging**
- Append-only audit log: `~/.operastudio/audit.log`
- Format: JSON lines with hash chaining
- Rotate: Keep 30 days, compress older
- User can view/export logs

### 2.4 Auto-Update Mechanism

**Update Channels:**
- **Stable:** Production releases (`updates.operastudio.app`)
- **Beta:** Pre-release testing (`beta.operastudio.app`) - Opt-in only

**Beta Channel (Opt-In):**
- **Isolation:** Separate signed update feed (`beta.operastudio.app`)
- **Enrollment:** User must explicitly opt-in via launcher settings
- **Visual Marking:** Beta builds marked in UI and logs
- **Never Auto-Enroll:** Production users never auto-enrolled in beta
- **Use Case:** Advanced users and internal testers validate updates before GA

**Update Check:**
- Check on launcher start (if enabled)
- Check every 24 hours (if running)
- User can disable auto-update
- Channel selection persists across updates

**Update Process:**
- Download new binary to temp location
- Verify signature/checksum
- Replace current binary atomically
- Restart launcher
- Rollback on failure (keep previous version)

**Version Retention:**
- **Keep 3 Versions:** Current + 2 prior installers
- **On Disk:** Current binary + two prior installers in `~/.operastudio/versions/`
- **Update Manifest:** Server-side manifest prunes older versions
- **Archive:** All builds archived server-side for audit (not on client)

**Rollback Policy:**

**Automatic Rollback (Failure Cases):**
- Update fails integrity check (signature/checksum invalid)
- Launcher crashes on startup twice consecutively
- Launcher loses handshake with web API (cannot authenticate)
- Health check fails after update

**Manual Rollback (Regression Cases):**
- User-initiated via launcher settings → "Revert to previous version"
- User can select which prior version to revert to (from 3 kept versions)
- Manual rollback requires user confirmation

**Never Silent Downgrade:**
- Never automatically downgrade on normal success path
- Updates only move forward (newer versions)
- Rollback only on failure or user request
- User always notified of rollback action

**Rollback Process:**
1. Detect failure condition (automatic) or user request (manual)
2. Stop current launcher process
3. Restore previous version from `~/.operastudio/versions/`
4. Verify restored binary signature
5. Start restored version
6. Log rollback event to audit log
7. Notify backend of rollback (for telemetry)

---

## 3. Device Pairing Flow

### 3.1 Pairing Inputs

**Required:**
- `userId`: Clerk user ID (from authenticated session)
- Browser session: Clerk session token
- CSRF context: Next.js CSRF token (if applicable)

**Optional:**
- Device name: User-provided or auto-generated
- Device metadata: OS, architecture, hostname

### 3.2 Pairing Steps

**Step 1: Nonce Issuance**
- User clicks "Connect to File System"
- Backend generates nonce: `{nonce, userId, timestamp, origin}`
- Sign with backend secret: `HMAC-SHA256(nonce, backendSecret)`
- Return nonce to browser
- Nonce TTL: 60 seconds

**Step 2: Protocol Handler Invocation**
- Browser constructs URL: `operastudio://connect?nonce={signedNonce}&user={userId}&origin={appOrigin}`
- OS opens protocol handler
- Launcher binary starts (if not running)

**Step 3: PKCE-Style Proof**
- Launcher generates keypair: `(devicePublicKey, devicePrivateKey)`
- Launcher computes proof: `HMAC-SHA256(nonce + devicePublicKey, devicePrivateKey)`
- Launcher sends to backend: `{nonce, devicePublicKey, proof, deviceMetadata}`
- Backend verifies proof + nonce signature
- Backend generates device token: `{deviceId, userId, devicePublicKey, issuedAt, expiresAt}`

**Step 4: Local Key Material Storage**
- Launcher stores: `devicePrivateKey` (encrypted, OS keychain)
- Launcher stores: `deviceToken` (encrypted, local config)
- Launcher stores: `deviceId` (plaintext, for identification)

**Step 5: Device Token Issuance**
- Backend stores device record:
  - `deviceId` (UUID)
  - `userId` (Clerk ID)
  - `devicePublicKey` (for verification)
  - `deviceName` (user-provided or auto)
  - `deviceMetadata` (OS, arch, hostname)
  - `status` (`pending` → `active`)
  - `pairedAt` (timestamp)
  - `lastSeenAt` (timestamp)
- Backend returns device token to launcher

**Step 6: Session Bootstrap**
- Launcher generates session HMAC secret
- Launcher sends to backend: `{deviceToken, sessionSecret, mcpPort}`
- Backend validates device token
- Backend stores session: `{sessionId, deviceId, userId, secret, mcpPort, status: active}`
- Backend returns session token to launcher

### 3.3 Device Record Fields

**Core Fields:**
- `deviceId`: UUID v4
- `userId`: Clerk user ID
- `devicePublicKey`: Public key (for verification)
- `deviceName`: User-friendly name
- `status`: `pending` | `active` | `revoked`
- `pairedAt`: ISO 8601 timestamp
- `lastSeenAt`: ISO 8601 timestamp (updated on heartbeat)

**Metadata Fields:**
- `os`: `darwin` | `linux` | `win32`
- `arch`: `amd64` | `arm64`
- `hostname`: System hostname
- `launcherVersion`: Version string

**Security Fields:**
- `revokedAt`: ISO 8601 timestamp (if revoked)
- `revocationReason`: `user` | `security` | `timeout`
- `rotationCount`: Number of times device token rotated

### 3.4 Device State Machine

**States:**
- `pending`: Nonce issued, awaiting launcher proof
- `active`: Device paired, can start sessions
- `revoked`: Device access revoked, cannot start sessions

**Transitions:**
- `pending` → `active`: On successful PKCE proof
- `active` → `revoked`: On user revocation or security event
- `revoked` → `active`: Not allowed (must re-pair)

**State Persistence:**
- Backend database: Device records
- Launcher local: Device token (encrypted)

### 3.5 Token Rotation & Expiry

**Device Token Rotation:**
- Rotate every 90 days (optional, user-configurable)
- On rotation: Generate new keypair, issue new token
- Old token invalidated after grace period (7 days)

**Device Token Expiry:**
- Default: 1 year (configurable)
- On expiry: Device status → `revoked`
- User must re-pair

**Session Token Expiry:**
- Per-session: Expires on session end
- Idle timeout: 5 minutes (configurable)
- On expiry: Session closed, MCP server terminated

### 3.6 Revocation Semantics

**Revocation Triggers:**
- User-initiated: "Revoke Device" in settings
- Security event: Suspicious activity detected
- Timeout: Device token expired
- Admin action: Backend admin revokes device

**Revocation Process:**
1. Backend sets device status → `revoked`
2. Backend invalidates all active sessions for device
3. Backend sends revocation signal to launcher (if connected)
4. Launcher receives signal, terminates MCP server
5. Launcher clears local device token
6. Launcher shuts down (or waits for re-pair)

**Re-Pairing After Revocation:**
- User must initiate new pairing flow
- New device ID issued
- Previous device record marked `revoked`
- Audit log records revocation reason

---

## 4. Local Session Lifecycle

### 4.1 Session Start

**Trigger:**
- User clicks "Connect → File System" in sidebar
- Backend checks: User authenticated? Device paired? No active session?

**Flow:**
1. Backend generates nonce (if not already paired) or uses device token
2. Backend constructs protocol URL: `operastudio://connect?nonce={nonce}&user={userId}&origin={appOrigin}`
3. Browser invokes protocol handler
4. OS launches launcher binary
5. Launcher validates nonce (or uses stored device token)
6. Launcher starts MCP server on `127.0.0.1` (random port)
7. Launcher generates session HMAC secret
8. Launcher sends to backend: `{deviceToken, sessionSecret, mcpPort, mode: null}`
9. Backend validates device token, creates session record
10. Backend returns session token to launcher
11. Launcher displays mode selection UI (Safe/Balanced/Unrestricted)
12. User selects mode and duration (if Unrestricted)
13. Launcher confirms mode to backend
14. Backend updates session: `{mode, duration, status: active}`
15. Sidebar switches to file tree (rooted at Home)
16. Status pill shows: "Connected • {Mode} • {Timer}"

**Time Target:** ≤3 seconds from click to connected (on modern hardware)

### 4.2 Session Use

**Tool Call Flow:**
1. User sends message to LLM (via chat)
2. LLM generates tool call: `fs.read("src/index.ts")`
3. Backend receives tool call, validates session
4. Backend proxies to launcher: `POST http://127.0.0.1:{mcpPort}/tools/fs.read`
5. Launcher validates session token (HMAC)
6. Launcher checks policy (mode-based)
7. If Safe/Balanced + write/exec: Show consent dialog
8. If approved: Launcher forwards to MCP server
9. MCP server executes tool (reads file, runs command, etc.)
10. MCP server streams results back
11. Launcher applies output redaction (if needed)
12. Launcher streams to backend
13. Backend streams to browser via SSE
14. LLM receives result, continues conversation

**Streaming Events:**
- `tool.start`: Tool execution started
- `tool.chunk`: Partial result (for large outputs)
- `tool.complete`: Tool finished successfully
- `tool.error`: Tool failed with error
- `tool.cancel`: Tool cancelled by user

**Structured Errors:**
- `PERMISSION_DENIED`: File/command not accessible
- `NOT_FOUND`: Path doesn't exist
- `TIMEOUT`: Command exceeded timeout
- `POLICY_VIOLATION`: Denied by policy engine
- `SYMLINK_LOOP`: Symlink loop detected
- `QUOTA_EXCEEDED`: Session quota exceeded

**Per-Call Privacy Toggle:**
- Each user message has checkbox: "Include file contents"
- Default: Unchecked (metadata only)
- When checked: Full file contents included in LLM context
- Privacy state sent with each turn: `{privacy: boolean}`

### 4.3 Session End

**End Triggers:**
- Timer: Unrestricted session reaches time limit
- Logout: User logs out of Clerk session
- User Stop: User clicks "Stop" in status pill
- Transport Break: Connection lost (network error)
- Device Revoked: Device access revoked

**End Process:**
1. Backend detects end trigger
2. Backend sends end signal to launcher (if connected)
3. Launcher receives signal, terminates MCP server
4. Launcher kills all child processes (commands, file watchers)
5. Launcher revokes session token locally
6. Launcher generates final receipt (if writes occurred)
7. Launcher sends receipt to backend
8. Backend saves receipt to session history
9. Backend updates session: `{status: ended, endedAt, receipt}`
10. Sidebar switches back to disconnected state
11. Browser shows receipt card (if writes occurred)

**Receipt Contents:**
- Session duration
- Files changed (list with paths)
- Commands executed (list)
- Bytes read/written
- Exit codes summary
- Actions: "Open changed files", "Revert changes"

---

## 5. HMAC Transport Details (Localhost)

### 5.1 Token Format

**Token Structure:**
```json
{
  "iss": "operastudio-backend",
  "aud": "operastudio-launcher",
  "userId": "user_abc123",
  "deviceId": "device_xyz789",
  "sessionId": "session_def456",
  "origin": "https://app.operastudio.com",
  "iat": 1234567890,
  "exp": 1234567950,
  "nonce": "random-nonce-string"
}
```

**Claims:**
- `iss`: Issuer (backend identifier)
- `aud`: Audience (launcher identifier)
- `userId`: Clerk user ID
- `deviceId`: Device UUID
- `sessionId`: Session UUID
- `origin`: App origin (for origin pinning)
- `iat`: Issued at (Unix timestamp)
- `exp`: Expires at (Unix timestamp)
- `nonce`: Random nonce (single-use)

**Signature:**
- Algorithm: HMAC-SHA256
- Secret: Per-session secret (generated by launcher, exchanged securely)
- Format: `HMAC-SHA256(JSON.stringify(claims), sessionSecret)`
- Token: `base64url(claims) + "." + base64url(signature)`

### 5.2 TTLs and Windows

**Token TTL:**
- Default: 60 seconds
- Refresh: New token issued every 30 seconds (if session active)
- Expiry: Token invalid after `exp` timestamp

**Replay Window:**
- 10 seconds (tokens accepted if `iat` within last 10s)
- Prevents replay attacks
- Launcher maintains nonce cache (10s window)

**Clock Skew Tolerance:**
- ±30 seconds
- Launcher checks: `now - 30s ≤ exp ≤ now + 30s`
- Reject if outside window

### 5.3 Secret Exchange

**Secret Generation:**
- Launcher generates: 32-byte random secret
- Secret stored: Encrypted in OS keychain (per session)

**Secret Exchange:**
- During pairing: Launcher sends secret to backend via HTTPS (encrypted)
- Backend stores: Secret encrypted in database (per session)
- Both sides use same secret for HMAC signing/verification

**Secret Rotation:**
- Rotate on session resume (if supported)
- Rotate on security event (if detected)
- Old secret invalidated immediately

### 5.4 Bindings

**Loopback Only:**
- Bind to `127.0.0.1` (localhost)
- Reject connections from other IPs
- No external network access

**Random High Port:**
- Port range: 49152-65535 (ephemeral ports)
- Random selection on MCP server start
- Port communicated to backend during session start

**Origin Pinning:**
- Token includes `origin` claim
- Launcher verifies: `request.origin === token.origin`
- Reject if origin mismatch
- Prevents cross-origin attacks

**CORS Off:**
- No CORS headers sent
- Localhost only, no cross-origin needed
- Simple HTTP/WebSocket protocol

### 5.5 Failure Taxonomy

**Expired Token:**
- Error: `TOKEN_EXPIRED`
- Action: Request new token from backend
- Retry: Automatic (if session still active)

**Replayed Token:**
- Error: `TOKEN_REPLAYED`
- Action: Reject request, log security event
- Retry: Not allowed (security violation)

**Origin Mismatch:**
- Error: `ORIGIN_MISMATCH`
- Action: Reject request, log security event
- Retry: Not allowed (security violation)

**Device Revoked:**
- Error: `DEVICE_REVOKED`
- Action: Terminate session, clear device token
- Retry: Not allowed (must re-pair)

**Session Closed:**
- Error: `SESSION_CLOSED`
- Action: Terminate MCP server, end session
- Retry: Not allowed (session ended)

---

## 6. MCP Façade Contract

### 6.1 Tool Discovery

**Discovery Endpoint:**
- `GET /tools` (returns available tools)
- Response: `{tools: [{name, description, parameters}]}`

**Metadata Format:**
- `name`: Tool identifier (`fs.read`, `exec.run`, etc.)
- `description`: Human-readable description
- `parameters`: JSON Schema for parameters
- `requiresConsent`: Boolean (if mode-based consent needed)

### 6.2 Initial Tools

**File System Tools:**

**`fs.read(path|glob, maxBytes, binary?:bool)`**
- `path`: File path (string) or glob pattern (string)
- `maxBytes`: Maximum bytes to read (number, default: 10MB)
- `binary`: Return as binary (boolean, default: false)
- Returns: `{content: string|base64, size: number, type: string, mime?: string}`
- Errors: `NOT_FOUND`, `PERMISSION_DENIED`, `TOO_LARGE`

**`fs.list(path, depth, includeHidden?:bool)`**
- `path`: Directory path (string)
- `depth`: Max depth to recurse (number, default: 1)
- `includeHidden`: Include hidden files (boolean, default: false)
- Returns: `{items: [{path, type, size, mtime, permissions}]}`
- Errors: `NOT_FOUND`, `PERMISSION_DENIED`, `NOT_DIRECTORY`

**`fs.search(pattern, roots[], maxResults, maxBytesScanned)`**
- `pattern`: Search pattern (regex or glob, string)
- `roots`: Root directories to search (string[])
- `maxResults`: Maximum results (number, default: 100)
- `maxBytesScanned`: Max bytes to scan (number, default: 100MB)
- Returns: `{matches: [{path, match, context}]}`
- Errors: `PATTERN_INVALID`, `QUOTA_EXCEEDED`

**`fs.write(path, content|patch, create?:bool)`**
- `path`: File path (string)
- `content`: Full content (string) or patch (object with `old`, `new`)
- `create`: Create if not exists (boolean, default: false)
- Returns: `{written: number, path: string}`
- Errors: `PERMISSION_DENIED`, `NOT_FOUND` (if create=false), `PATCH_FAILED`

**Execution Tools:**

**`exec.run(cmd, args[], cwd, envAllowlist[], timeoutMs, tty?:bool)`**
- `cmd`: Command name (string)
- `args`: Command arguments (string[])
- `cwd`: Working directory (string)
- `envAllowlist`: Environment variables to pass (string[], default: [])
- `timeoutMs`: Timeout in milliseconds (number, default: 30000)
- `tty`: Allocate TTY (boolean, default: false)
- Returns: `{stdout: string, stderr: string, exitCode: number, duration: number}`
- Errors: `COMMAND_NOT_FOUND`, `TIMEOUT`, `PERMISSION_DENIED`, `NON_ZERO_EXIT`

**Git Tools:**

**`git.status`**
- No parameters
- Returns: `{modified: string[], added: string[], deleted: string[], untracked: string[]}`
- Errors: `NOT_GIT_REPO`, `GIT_ERROR`

**`git.diff(path?)`**
- `path`: Optional file path (string, if omitted: all changes)
- Returns: `{diff: string, files: string[]}`
- Errors: `NOT_GIT_REPO`, `FILE_NOT_FOUND`

**`git.commit(message, addAll?:bool)`**
- `message`: Commit message (string)
- `addAll`: Stage all changes (boolean, default: false)
- Returns: `{commitHash: string, files: string[]}`
- Errors: `NOT_GIT_REPO`, `NO_CHANGES`, `GIT_ERROR`

### 6.3 Streaming Rules

**Chunk Size:**
- Default: 64KB per chunk
- Configurable per tool (large files: 1MB chunks)

**Rate Caps:**
- Read rate: 10MB/s max
- Write rate: 5MB/s max
- Exec output: 1MB/s max

**Truncation:**
- Large outputs: Truncate to first 10MB (configurable)
- Show truncation indicator: `"... (truncated, 15MB total)"`
- User can request full output (if privacy allows)

**Binary Gating:**
- Binary files: Metadata only by default
- User toggle: "View raw" (shows hex/base64)
- Large binaries: Always metadata only (>10MB)

---

## 7. Policy Engine in Launcher

### 7.1 Mode Definitions

**Safe Mode:**
- Reads: Auto-approved (no prompt)
- Writes: Require approval (show diff preview)
- Executions: Require approval (show command preview)
- Elevation: Always prompt (OS prompt + app confirmation)
- Visual: Green badge "Safe"

**Balanced Mode:**
- Reads: Auto-approved (no prompt)
- Writes: Require approval (show diff preview)
- Executions: Require approval (show command preview)
- Elevation: Always prompt (OS prompt)
- Visual: Yellow badge "Balanced"

**Unrestricted Mode:**
- Reads: Auto-approved (no prompt)
- Writes: Auto-approved (no prompt, show toast)
- Executions: Auto-approved (no prompt, show toast)
- Elevation: Auto-approve (OS prompt only)
- Visual: Red badge "Unrestricted"
- Time-boxed: Default 10 minutes, max 30 minutes per 24h

### 7.2 Deny-Lists

**System Roots (Default Deny):**
- macOS: `/System`, `/Library/System`, `/usr/bin`, `/sbin`
- Linux: `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin`, `/boot`, `/sys`, `/proc`
- Windows: `C:\Windows\System32`, `C:\Windows\SysWOW64`

**Secrets (Pattern-Based Deny):**
- `**/.env`, `**/.env.*` (environment files)
- `**/secrets/**`, `**/secret/**` (secret directories)
- `**/*.key`, `**/*.pem`, `**/*.p12` (key files)
- `**/.ssh/**` (SSH keys)
- `**/.aws/**` (AWS credentials)
- `**/.config/gcloud/**` (GCP credentials)

**User-Configurable:**
- User can add custom deny patterns (regex)
- User can override system denies (with warning)

### 7.3 Allow-Lists

**Optional Override:**
- User can create allow-list (regex patterns)
- Allow-list overrides deny-list
- Use case: "Allow access to `/System/Library` for development"

**Default:**
- No allow-list by default
- User must explicitly create

### 7.4 Symlink Policy

**Evaluation:**
- Resolve symlink to `realpath`
- Check permissions on `realpath` (not symlink)
- Apply deny/allow lists to `realpath`

**Write Behavior:**
- If safe: Preserve symlink (write to symlink, not target)
- If unsafe: Warn user, offer to write to target instead
- Always show `realpath` in approval sheets

**Symlink Loops:**
- Detect loops (max depth: 10)
- Error: `SYMLINK_LOOP`
- Block access, show error

### 7.5 Quotas Per Session

**Max Concurrent Tool Runs:**
- Default: 5 concurrent runs
- Behavior when exceeded: Queue requests, reject with `QUOTA_EXCEEDED`

**Max Bytes Read:**
- Default: 100MB per session
- Behavior when exceeded: Reject reads, show warning

**Max Bytes Written:**
- Default: 10MB per session
- Behavior when exceeded: Reject writes, show warning

**Max Exec Count:**
- Default: 20 executions per session
- Behavior when exceeded: Reject executions, show warning

**Quota Reset:**
- Reset on session start
- Persist across reconnects (same session)
- Clear on session end

### 7.6 Output Redaction

**Stack Traces:**
- Remove file paths: `***/file.ts:123`
- Remove environment variables: `***`
- Keep error messages (generic)

**Environment Values:**
- Redact `process.env` values in outputs
- Show: `ENV_VAR_NAME=***`
- User can toggle "Show env values" (if privacy allows)

**Hashed Summaries:**
- Large outputs: Return hash + size instead of content
- Format: `{hash: "sha256:...", size: 1234567, type: "text"}`
- User can request full content (if privacy allows)

### 7.7 Network Egress Default

**Default: Off**
- No network access by default
- Commands cannot make HTTP requests
- File operations cannot access network shares (unless explicitly allowed)

**Allow Network (Optional):**
- User can enable "Allow network access" in settings
- Applies to `exec.run` commands only
- Logged in audit log

---

## 8. Working Directory and Selection Model

### 8.1 Per-Session State

**State Variables:**
- `cwd`: Current working directory (absolute path, default: `~`)
- `selection`: Currently selected file (absolute path, or `null`)

**State Persistence:**
- Persists across LLM turns (until user changes)
- Resets on session end
- Can be set by user (click folder) or LLM (via tool call)

### 8.2 Sidebar File Tree

**Root:**
- Default: Home directory (`~`)
- User can change root (via settings, future feature)

**Click Folder:**
- Sets `cwd = clicked_folder_path`
- Clears `selection = null`
- System message posted: "Working directory: /path/to/folder"

**Click File:**
- Sets `cwd = file.parent_directory`
- Sets `selection = clicked_file_path`
- File opens in editor tab
- System message posted: "Opened: filename.ext (size, type)"

### 8.3 Hidden System Context

**Included with Each User Turn:**
```json
{
  "cwd": "/Users/name/project",
  "selection": "/Users/name/project/src/index.ts",
  "mode": "Safe",
  "privacy": false
}
```

**Context Usage:**
- LLM uses `cwd` to resolve relative paths
- LLM uses `selection` to understand current focus
- LLM uses `mode` to determine consent requirements
- LLM uses `privacy` to decide if file contents included

### 8.4 Resolver Rules

**Relative Names:**
- `Testing` → `{cwd}/Testing`
- `./` → `{cwd}`
- `../` → `parent({cwd})`
- `~` → User home directory
- `Desktop` → `~/Desktop` (or OS equivalent)
- `Documents` → `~/Documents` (or OS equivalent)

**Matching Priority:**
1. Exact match (case-sensitive)
2. Case-insensitive match
3. Fuzzy match (Levenshtein distance < 3)
4. Partial match (contains substring)

**Ambiguity Handling:**
- If multiple matches: "Found multiple matches: utils/, src/utils/. Which one?"
- Show list with full paths
- User selects, or LLM uses context to infer

**Nonexistent Paths:**
- "Path not found: utils/helper.ts"
- Propose: "Create new file?" or "Did you mean: utils/helpers.ts?"

---

## 9. Consent UX and Enforcement Point

### 9.1 Consent Dialogs (Launcher-Rendered)

**Why Launcher (Not Web Page):**
- Security: Cannot be spoofed by malicious web page
- Trust: User sees native OS dialog
- Isolation: Consent decision isolated from browser

**Dialog Types:**

**Write Approval:**
- Title: "Approve File Change"
- Content: Diff preview (before/after)
- Stats: Lines added/removed, bytes changed
- Buttons: "Approve", "Reject", "Edit Before Approving"

**Delete Approval:**
- Title: "Approve File Deletion"
- Content: File preview (what will be deleted)
- Warning: "This action cannot be undone"
- Buttons: "Approve", "Reject"

**Execution Approval:**
- Title: "Approve Command Execution"
- Content: Command preview (command, args, cwd, resolved binary)
- Timeout: Display timeout value
- Buttons: "Approve", "Reject", "Edit Command"

### 9.2 Elevation Preview

**Before OS Prompt:**
- Show elevation preview: "This command may require administrator privileges"
- Show what will be elevated: Command name, binary path
- User confirms: "Continue" or "Cancel"

**Elevation Use Logged:**
- All elevation requests logged in audit log
- Flagged in session receipt: "Elevated commands: 2"

### 9.3 Per-Call Privacy Toggle

**UI Location:**
- Each user message input has checkbox
- Label: "Include file contents"
- Default: Unchecked (metadata only)

**Behavior:**
- When unchecked: Only metadata sent (path, size, type)
- When checked: Full file contents included in LLM context
- Privacy state sent with each turn: `{privacy: boolean}`

**Enforcement:**
- Backend respects privacy flag
- Launcher enforces privacy (doesn't send contents if `privacy=false`)
- MCP server doesn't see privacy flag (launcher handles)

---

## 10. Audit, Receipts, and Observability

### 10.1 Local Append-Only Log

**Location:**
- `~/.operastudio/audit.log` (macOS/Linux)
- `%LOCALAPPDATA%\OperaStudio\audit.log` (Windows)

**Format:**
- JSON Lines (one event per line)
- Hash chaining: Each event includes `hashPrev` and `hashThis`

**Event Fields:**
- `userId`: Clerk user ID
- `deviceId`: Device UUID
- `sessionId`: Session UUID
- `tool`: Tool name (`fs.read`, `exec.run`, etc.)
- `argsHash`: SHA256 hash of tool arguments (privacy-preserving)
- `pathsCount`: Number of paths accessed
- `bytesRead`: Bytes read (number)
- `bytesWritten`: Bytes written (number)
- `exitCode`: Exit code (number, if execution)
- `elevated`: Boolean (if elevation used)
- `duration`: Duration in milliseconds (number)
- `timestamp`: ISO 8601 timestamp
- `hashPrev`: Previous event hash (for chaining)
- `hashThis`: Current event hash (SHA256 of event JSON)

**Log Rotation:**
- Keep 30 days of logs
- Compress older logs (gzip)
- User can export logs (JSON/CSV)

### 10.2 Remote Attestation (Optional)

**Head Hash Only:**
- Backend stores: `{userId, deviceId, sessionId, headHash, timestamp}`
- No content sent (privacy-preserving)
- Used for: Audit verification, tamper detection

**Attestation Flow:**
- On session end: Launcher sends head hash to backend
- Backend stores attestation record
- User can verify: Compare local head hash with remote

### 10.3 User-Visible Receipts

**Receipt Contents:**
- Session duration
- Files changed (list with paths)
- Commands executed (list)
- Bytes read/written
- Exit codes summary
- Elevated commands count

**Receipt Actions:**
- "Open changed files" (opens all in editor tabs)
- "Revert changes" (shows confirmation, reverts if approved)
- "View full log" (opens audit log viewer)
- "Download receipt" (exports JSON/CSV)

**Receipt Persistence:**
- Saved to session history (backend)
- Accessible from settings → Session History
- Can be exported or deleted

---

## 11. Backend Integration

### 11.1 Endpoints

**`POST /api/devices/pair`**
- Input: `{nonce, devicePublicKey, proof, deviceMetadata}`
- Output: `{deviceId, deviceToken}`
- Auth: Clerk session required

**`POST /api/sessions/start`**
- Input: `{deviceToken, sessionSecret, mcpPort}`
- Output: `{sessionId, sessionToken}`
- Auth: Device token required

**`POST /api/sessions/heartbeat`**
- Input: `{sessionId, sessionToken}`
- Output: `{status: "active"}` or `{status: "revoked"}`
- Auth: Session token required
- Frequency: Every 30 seconds

**`POST /api/sessions/stop`**
- Input: `{sessionId, sessionToken}`
- Output: `{receipt}`
- Auth: Session token required

**`POST /api/devices/revoke`**
- Input: `{deviceId}`
- Output: `{status: "revoked"}`
- Auth: Clerk session required (user revokes own device)

**`POST /api/tools/proxy`**
- Input: `{sessionToken, toolCall}`
- Output: SSE stream (tool results)
- Auth: Session token required
- Proxies to launcher → MCP server

### 11.2 Rate Limit Keys

**Local Sessions:**
- Key: `userId` + `deviceId`
- Limit: Distinct from chat budget
- Default: 100 tool calls per minute per device

**Chat Budget:**
- Key: `userId`
- Limit: Existing chat rate limits (60 requests/minute)
- Separate from local session limits

### 11.3 SSE Event Schema

**Tool Start:**
```json
{
  "type": "tool.start",
  "tool": "fs.read",
  "args": {"path": "src/index.ts"}
}
```

**Tool Chunk:**
```json
{
  "type": "tool.chunk",
  "data": "file content chunk..."
}
```

**Tool Complete:**
```json
{
  "type": "tool.complete",
  "result": {"content": "...", "size": 1234}
}
```

**Tool Error:**
```json
{
  "type": "tool.error",
  "error": "NOT_FOUND",
  "message": "File not found: src/index.ts"
}
```

### 11.4 Error Sanitization Rules

**Stack Traces:**
- Remove file paths: `***/file.ts:123`
- Remove environment variables: `***`
- Keep error messages (generic)

**File Paths:**
- User paths: Show as-is (user's own files)
- System paths: Redact to `***/system/path`
- Secrets: Redact to `***/secret/file`

**Command Output:**
- Large outputs: Truncate to first 10MB
- Show truncation indicator
- User can request full output (if privacy allows)

### 11.5 Data Retention Defaults

**Session Data:**
- Retain: 30 days (configurable)
- After retention: Delete session records, keep receipts

**Device Data:**
- Retain: 1 year (or until revoked)
- After revocation: Keep record (marked `revoked`)

**Audit Logs:**
- Local: 30 days (user-controlled)
- Remote: Head hashes only, 90 days

### 11.6 Privacy Posture

**Default:**
- File contents: Do not upload (metadata only)
- User must explicitly toggle per call

**Compliance:**
- GDPR: User data exportable, deletable
- CCPA: User can revoke access, delete data
- Audit logs: User can view/export

---

## 12. UX Script

**Disconnected:**
- Sidebar shows connector list
- "Connect to File System" button visible
- Main pane: Chat interface (full width)

**Connect:**
- User clicks "Connect to File System"
- Protocol handler opens launcher
- Launcher validates nonce, starts MCP server

**First-Run Consent:**
- Launcher shows mode selection UI
- User selects: Safe / Balanced / Unrestricted
- If Unrestricted: User sets duration (10-30 min)

**Connected:**
- Sidebar switches to file tree (rooted at Home)
- Status pill shows: "Connected • Safe • 12:34"
- Main pane: Chat interface (full width)

**Open File:**
- User clicks file in tree
- File opens in editor tab
- Split view: 50/50 (chat left, editor right)
- System message: "Opened: filename.ext (size, type)"

**Approve Action (Safe/Balanced):**
- LLM proposes write/exec
- Launcher shows approval sheet (native dialog)
- User reviews diff/command preview
- User approves or rejects
- If approved: Action executes, result streams to chat

**Unrestricted Banner:**
- High-contrast banner: "UNRESTRICTED MODE ACTIVE • 14:32 remaining • [Kill Switch]"
- Timer counts down
- All actions auto-approved (no sheets)
- Warning toasts for destructive actions

**Stop/Timeout:**
- User clicks "Stop" or timer reaches 0
- Session ends, MCP server terminated
- Receipt shown (if writes occurred)
- Sidebar returns to disconnected state

---

## 13. Acceptance Criteria

✅ **Cannot start/resume session without Clerk auth and active device**
- Backend validates Clerk session before pairing
- Backend validates device token before session start
- Launcher rejects requests without valid tokens

✅ **Protocol click establishes session in ≤3s**
- Target: Click to connected in ≤3 seconds
- Measured on modern hardware (M1 Mac, modern Windows/Linux)
- Includes: Protocol handler → Launcher start → MCP server → Session established

✅ **Sidebar switches to Home-rooted tree**
- On connect: Sidebar shows file tree
- Root: Home directory (`~`)
- Tree is interactive (expand/collapse, search)

✅ **`cwd` updates deterministically**
- Click folder → `cwd = folder`
- Click file → `cwd = file.parent`
- System message posted on change

✅ **LLM resolves bare names relative to `cwd`**
- User says "utils" → Resolves to `{cwd}/utils`
- Relative paths work correctly
- Absolute paths still work

✅ **Unrestricted sessions time-boxed, cancelable, logged**
- Timer visible in banner
- Kill switch available
- All actions logged in audit log
- Post-session receipt shows all changes

✅ **Secrets and binary contents never leave device unless toggled**
- Default: Metadata only (path, size, type)
- User must toggle "Include file contents" per call
- Privacy flag enforced by launcher

✅ **Revocation severs localhost link and terminates processes immediately**
- Backend sends revocation signal to launcher
- Launcher terminates MCP server
- Launcher kills all child processes
- Launcher clears device token
- Connection severed within 1 second

---

## 14. Finalized Decisions

### 14.1 Default File Tree Root
- **Decision:** Home directory (`~`)
- **Rationale:** Most intuitive starting point for users
- **Implementation:** Sidebar file tree roots at `~` on connect

### 14.2 Launcher Vector
- **Decision:** Custom protocol handler → signed micro-launcher binary
- **Rationale:** Optimal UX, production-ready, enterprise-friendly
- **Implementation:** `operastudio://` protocol scheme, signed binaries per platform

### 14.3 Beta Channel
- **Decision:** Yes, opt-in only
- **Rationale:** Allows advanced users and internal testers to validate updates before GA
- **Implementation:**
  - Separate signed update feed: `beta.operastudio.app`
  - Visual marking: Beta builds marked in UI and logs
  - Never auto-enroll: Production users never auto-enrolled
  - User opt-in: Explicit setting in launcher preferences

### 14.4 Version Retention
- **Decision:** Keep 3 versions (current + 2 prior)
- **Rationale:** Covers one active, one previous, and one emergency rollback
- **Implementation:**
  - On disk: Current binary + two prior installers in `~/.operastudio/versions/`
  - Update manifest: Server-side manifest prunes older versions
  - Archive: All builds archived server-side for audit (not on client)

### 14.5 Rollback Behavior
- **Decision:** Automatic for failure, manual for regression
- **Rationale:** Protects users from broken updates while allowing manual control
- **Implementation:**
  - **Automatic rollback triggers:**
    - Update fails integrity check (signature/checksum invalid)
    - Launcher crashes on startup twice consecutively
    - Launcher loses handshake with web API (cannot authenticate)
    - Health check fails after update
  - **Manual rollback:**
    - User-initiated via launcher settings → "Revert to previous version"
    - User can select which prior version to revert to (from 3 kept versions)
    - Requires user confirmation
  - **Never silent downgrade:** Updates only move forward on normal success path

### 14.6 Timer Defaults
- **Decision:** Unrestricted 10 min per session, max 30 min per 24h, idle timeout 5 min
- **Rationale:** Balance between usability and security
- **Implementation:** Configurable per-user, enforced by backend

### 14.7 Quotas
- **Decision:** Max concurrent: 5, Max bytes read: 100MB, Max bytes written: 10MB, Max exec: 20
- **Rationale:** Prevent resource exhaustion while allowing typical workflows
- **Implementation:** Enforced by launcher policy engine, configurable per-user

### 14.8 Deny-Lists
- **Decision:** OS-specific system roots + pattern-based secrets
- **Rationale:** Protect critical system files and user secrets
- **Implementation:** Hard-coded defaults, user-configurable overrides

### 14.9 Large-File Behavior
- **Decision:** Preview 1MB, chunking threshold 10MB, binary threshold 10MB
- **Rationale:** Balance between preview usefulness and performance
- **Implementation:** Configurable per-user, enforced by MCP server

### 14.10 Auto-Update Channel and Rollback
- **Decision:** Stable channel default, beta opt-in, 3 versions kept, automatic rollback on failure
- **Rationale:** See sections 14.3, 14.4, 14.5 above
- **Implementation:** See section 2.4 above

---

**End of Architecture Blueprint**

This blueprint provides a complete, implementation-ready foundation for the Local Environment connector. All components, flows, security boundaries, and decisions are finalized and documented.

