# Local Environment Connector - Architectural Blueprint

**Version:** 1.0  
**Date:** 2025-01-27  
**Status:** Design Phase

---

## 1. System Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web App (Next.js)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Frontend: ChatInterface + Device Manager UI             │  │
│  │  - Connect button → Pairing flow                         │  │
│  │  - Session status pill (timer, mode indicator)           │  │
│  │  - Consent prompts (Safe/Balanced modes)                │  │
│  │  - Pause/Stop controls                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (authenticated)
                             │ SSE stream (tool calls + responses)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API (Next.js API Routes)            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  /api/chat (existing, requires auth)                     │  │
│  │  /api/devices/pair (new)                                 │  │
│  │  /api/devices/revoke (new)                               │  │
│  │  /api/mcp/proxy (new)                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Auth Layer: Session tokens, device tokens                │  │
│  │  Rate Limiting: Per-user, per-device                     │  │
│  │  Tool Router: Detects local tool calls → proxy to MCP    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/WebSocket (mutual TLS or signed nonces)
                             │ Tool calls (JSON-RPC 2.0 over MCP)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Launcher (Native Binary)               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  - Receives pairing code + scope                         │  │
│  │  - Manages MCP server lifecycle                          │  │
│  │  - Policy enforcement (deny-lists, limits)               │  │
│  │  - Consent UI (native OS prompts)                        │  │
│  │  - Audit logging                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Local IPC (stdin/stdout or named pipe)
                             │ MCP protocol (JSON-RPC 2.0)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Local MCP Server (127.0.0.1:PORT)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Tool Registry:                                           │  │
│  │  - fs.read(path|glob, maxBytes)                         │  │
│  │  - fs.write(path, content|patch, create?)               │  │
│  │  - fs.list(path, depth, includeHidden?)                 │  │
│  │  - fs.search(pattern, roots, limits)                    │  │
│  │  - exec.run(cmd, args[], cwd, envAllowlist[], timeout) │  │
│  │  - git.status/commit/diff                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Policy Layer: Pre-execution checks, output truncation   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

Trust Boundaries:
- [Web ↔ Backend]: HTTPS + session auth
- [Backend ↔ Launcher]: Mutual auth (device token + nonce)
- [Launcher ↔ MCP]: Localhost only, signed nonces
- [MCP ↔ OS]: Sandboxed permissions, explicit user consent
```

---

## 2. Auth and Pairing Prerequisites

### 2.1 Web User Authentication
- **Method:** Session-backed authentication
  - Primary: Passkeys (WebAuthn) for passwordless
  - Fallback: OAuth 2.0 (Google/GitHub)
- **Session Management:**
  - Next.js session cookies (httpOnly, secure, sameSite=strict)
  - Session expiry: 7 days (configurable)
  - Refresh tokens for extended sessions
- **Storage:** Encrypted session store (Redis or database)
- **Scope:** User ID, email, device list

### 2.2 Device Pairing Flow
- **Step 1: Initiation**
  - User clicks "Connect → Local Environment"
  - Backend generates: 8-digit pairing code (expires in 5 minutes)
  - Backend generates: PKCE code_verifier + code_challenge
  - Backend stores: {userId, code, challenge, expiresAt, scope}
- **Step 2: Launcher Registration**
  - User enters pairing code in launcher
  - Launcher generates: Ed25519 keypair (device identity)
  - Launcher sends: {code, code_verifier, devicePublicKey, deviceName, osInfo}
  - Backend validates: code, PKCE, stores device token
- **Step 3: Mutual Authentication**
  - Backend returns: {deviceToken, sessionToken, mcpPort, nonce}
  - Launcher stores: deviceToken (encrypted at rest)
  - Launcher starts MCP server on `127.0.0.1:mcpPort`
  - All subsequent requests: deviceToken + signed nonce
- **Step 4: Session Token**
  - Session token scoped to: {userId, deviceId, expiresAt, mode}
  - Timeboxed: 1 hour (Safe/Balanced), 15 minutes (Unrestricted)
  - Refreshable: Only if user is still authenticated
  - Revocable: Immediate via `/api/devices/revoke`

### 2.3 Token Structure
```
SessionToken {
  userId: string
  deviceId: string
  expiresAt: timestamp
  mode: "safe" | "balanced" | "unrestricted"
  scope: string[]  // ["fs.read", "fs.write", "exec.run"]
}

DeviceToken {
  deviceId: string
  publicKey: Ed25519
  userId: string
  createdAt: timestamp
  lastUsedAt: timestamp
  revoked: boolean
}
```

---

## 3. Launcher Options and Tradeoffs

### Option A: Browser Extension + Native Messaging
**Platform Support:**
- ✅ Chrome/Edge (Windows, macOS, Linux)
- ✅ Firefox (Windows, macOS, Linux)
- ❌ Safari (limited support)

**Update Path:**
- Extension auto-updates via Chrome Web Store/Firefox Add-ons
- Native host binary updates via extension API

**Install Friction:**
- Medium: User installs extension → extension prompts for native host
- Requires manual native host registration (one-time)

**Corp IT Compatibility:**
- ⚠️ May require admin approval for native host registration
- Extension store policies may block

**Security Implications:**
- ✅ Sandboxed extension context
- ✅ Native host runs with user permissions
- ⚠️ Native host registration requires admin on some systems

**Recommendation:** Good for MVP, cross-platform, but requires store approval.

---

### Option B: Custom Protocol Handler + Signed Micro-Daemon
**Platform Support:**
- ✅ Windows (custom protocol: `operastudio://`)
- ✅ macOS (URL scheme + signed app)
- ✅ Linux (desktop entry + xdg-open)

**Update Path:**
- Auto-update via HTTPS endpoint
- Code-signed binaries (required for macOS/Windows)

**Install Friction:**
- Low: Single installer/package
- First launch: OS prompts for protocol registration

**Corp IT Compatibility:**
- ✅ Can be deployed via MSI/DMG/deb packages
- ✅ Code signing enables enterprise trust

**Security Implications:**
- ✅ Code signing provides integrity
- ✅ Can request minimal OS permissions
- ⚠️ Requires certificate management

**Recommendation:** Best for production, lowest friction, enterprise-friendly.

---

### Option C: VS Code/Cursor Extension Hosting MCP
**Platform Support:**
- ✅ Windows, macOS, Linux (via VS Code/Cursor)

**Update Path:**
- Extension marketplace auto-updates

**Install Friction:**
- Low: Install extension only
- Requires VS Code/Cursor to be running

**Corp IT Compatibility:**
- ✅ Common in developer environments
- ⚠️ Requires IDE to be installed

**Security Implications:**
- ✅ Extension sandboxing
- ✅ IDE manages permissions
- ⚠️ Tied to IDE lifecycle

**Recommendation:** Good for developer-focused users, but limits audience.

---

### Option D: Resident Daemon Auto-Started at Login
**Platform Support:**
- ✅ Windows (Task Scheduler)
- ✅ macOS (LaunchAgent)
- ✅ Linux (systemd user service)

**Update Path:**
- Package manager updates (apt/yum/homebrew)
- Or auto-update service

**Install Friction:**
- Medium: Requires installer + OS service registration
- User must approve login item

**Corp IT Compatibility:**
- ✅ Standard OS service patterns
- ⚠️ May conflict with MDM policies

**Security Implications:**
- ⚠️ Always running (attack surface)
- ✅ Can run with minimal privileges
- ✅ OS-level service isolation

**Recommendation:** Best UX (always available), but highest security surface.

---

**Decision Matrix:**
- **MVP:** Option A (Browser Extension)
- **Production:** Option B (Custom Protocol Handler)
- **Developer Tool:** Option C (IDE Extension)
- **Enterprise:** Option D (Resident Daemon)

---

## 4. MCP Façade Contract

### 4.1 Protocol
- **Transport:** HTTP/1.1 or WebSocket over `127.0.0.1`
- **Format:** JSON-RPC 2.0
- **Authentication:** Signed nonces (HMAC-SHA256) per request

### 4.2 Tool Discovery
```
Method: tools/list
Response: {
  tools: [
    {
      name: "fs.read",
      description: "Read file contents",
      inputSchema: { ... }
    },
    ...
  ]
}
```

### 4.3 Tool Schemas

#### `fs.read`
```json
{
  "name": "fs.read",
  "description": "Read file or files matching glob pattern",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "File path or glob pattern"
      },
      "maxBytes": {
        "type": "integer",
        "default": 1048576,
        "description": "Maximum bytes to read (default 1MB)"
      }
    },
    "required": ["path"]
  }
}
```
**Limits:** 10MB per call, 100MB per session  
**Chunking:** For large files, return metadata + hash, require explicit opt-in  
**Binary Handling:** Base64 encode, truncate preview, require explicit flag for full content

#### `fs.write`
```json
{
  "name": "fs.write",
  "description": "Write or patch file contents",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "content": { "type": "string", "description": "Full content" },
      "patch": { "type": "object", "description": "JSON Patch operations" },
      "create": { "type": "boolean", "default": false }
    },
    "required": ["path"],
    "oneOf": [{"required": ["content"]}, {"required": ["patch"]}]
  }
}
```
**Limits:** 10MB per write, 50MB per session  
**Pre-execution:** Show diff preview, byte count, require consent (unless Unrestricted)

#### `fs.list`
```json
{
  "name": "fs.list",
  "description": "List directory contents",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "depth": { "type": "integer", "default": 1, "maximum": 5 },
      "includeHidden": { "type": "boolean", "default": false }
    },
    "required": ["path"]
  }
}
```
**Limits:** Max 1000 entries per call

#### `fs.search`
```json
{
  "name": "fs.search",
  "description": "Search files by pattern",
  "inputSchema": {
    "type": "object",
    "properties": {
      "pattern": { "type": "string", "description": "Regex or glob" },
      "roots": { "type": "array", "items": {"type": "string"} },
      "limits": {
        "type": "object",
        "properties": {
          "maxResults": { "type": "integer", "default": 100 },
          "maxSize": { "type": "integer", "default": 10485760 }
        }
      }
    },
    "required": ["pattern"]
  }
}
```

#### `exec.run`
```json
{
  "name": "exec.run",
  "description": "Execute shell command",
  "inputSchema": {
    "type": "object",
    "properties": {
      "cmd": { "type": "string" },
      "args": { "type": "array", "items": {"type": "string"} },
      "cwd": { "type": "string" },
      "envAllowlist": { "type": "array", "items": {"type": "string"} },
      "timeout": { "type": "integer", "default": 300 }
    },
    "required": ["cmd"]
  }
}
```
**Limits:** 5 minute timeout, 10 concurrent execs max  
**Pre-execution:** Show command preview, require consent (unless Unrestricted)  
**Output:** Truncate to 1MB stdout/stderr, stream if needed

#### `git.status` / `git.commit` / `git.diff`
```json
{
  "name": "git.status",
  "description": "Get git repository status",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Repository root" }
    }
  }
}
```
**Read-first:** All git tools are read-only except explicit `git.commit`  
**Limits:** Diff max 5MB, commit message max 10KB

### 4.4 Streaming
- **Tool Calls:** Synchronous JSON-RPC (blocking)
- **Large Outputs:** Chunked responses via `result.chunks[]` array
- **Progress:** Optional `progress` events for long-running operations

### 4.5 Error Taxonomy
```
Error Codes:
- INVALID_INPUT (400): Schema validation failed
- PERMISSION_DENIED (403): Policy blocked (path deny-list, etc.)
- NOT_FOUND (404): File/path doesn't exist
- TIMEOUT (408): Operation exceeded timeout
- QUOTA_EXCEEDED (429): Session limit reached
- CONSENT_REQUIRED (451): User must approve (Safe/Balanced mode)
- INTERNAL_ERROR (500): MCP server error
```

---

## 5. Consent Model

### 5.1 Modes

#### Safe Mode
- **Reads:** Prompt for each file read (except whitelisted dirs: `~/Documents`, `~/Projects`)
- **Writes:** Always prompt with diff preview
- **Exec:** Always prompt with command preview + estimated runtime
- **UI:** Modal dialog per operation, "Allow Once" / "Allow for Session" / "Deny"

#### Balanced Mode (Default)
- **Reads:** Auto-approve (no prompts)
- **Writes:** Prompt with diff preview
- **Exec:** Prompt with command preview
- **UI:** Toast notifications for auto-approved reads, modals for writes/exec

#### Unrestricted Mode
- **Reads/Writes/Exec:** All auto-approved
- **Timeboxed:** 15 minutes max, visible countdown timer
- **UI:** Prominent status pill with timer, large "Stop" button
- **Revocation:** One-click stop, immediate session termination

### 5.2 UI Signals

**Status Pill (Top Bar):**
```
[🟢 Local Environment Connected] [Balanced] [2h 34m remaining] [⏸ Pause] [⏹ Stop]
```

**Consent Prompt (Modal):**
```
⚠️ Write Operation Requested

File: /home/user/project/src/index.ts
Size: 1.2 KB
Preview:
  + import { newFeature } from './feature';
  - import { oldFeature } from './legacy';

[Allow Once] [Allow for Session] [Deny]
```

**Toast (Balanced Mode - Auto-approved Read):**
```
✓ Read: /home/user/project/README.md (2.1 KB)
```

### 5.3 Elevation Prompts
- **OS Integration:** Use native OS dialogs (not custom HTML)
- **macOS:** `NSUserNotification` or `osascript` dialog
- **Windows:** `MessageBox` API
- **Linux:** `zenity` or `kdialog` (fallback to terminal prompt)
- **Never:** Silent elevation, always require user interaction

### 5.4 Timers
- **Session Timer:** Visible in status pill, updates every second
- **Unrestricted Warning:** Show warning at 2 minutes remaining
- **Auto-pause:** After 30 minutes of inactivity (Safe/Balanced), require re-auth

---

## 6. Policy Layer in Launcher

### 6.1 Deny-Lists (Hard Blocks)
```
System Roots:
- /System (macOS)
- /Windows/System32 (Windows)
- /usr/bin, /usr/sbin (Linux)
- /etc (Linux, read-only exceptions)

Secrets:
- ~/.ssh/id_* (private keys)
- ~/.aws/credentials
- ~/.config/gcloud/*
- **/node_modules/.bin/* (execution blocked, read allowed)
- **/.env (read requires explicit consent)
```

### 6.2 Allow-Lists (Optional)
- User-configurable: `~/.operastudio/allowed-paths.json`
- Format: `["~/Projects/**", "/tmp/operastudio/**"]`
- Overrides deny-list for specific paths

### 6.3 Pre-Execution Checks

**Dry-Runs:**
- `fs.write`: Compute diff, show preview, count bytes
- `exec.run`: Validate command exists, check args, estimate runtime
- `fs.search`: Estimate result count, check if roots are accessible

**Diffs:**
- Unified diff format for file writes
- Highlight additions/deletions
- Show context lines (3 above/below)

**Byte Counts:**
- Display before operation: "Will write 1.2 MB to disk"
- Session totals: "Session: 45 MB read, 12 MB written"

### 6.4 Concurrency Limits
- **Reads:** 10 concurrent
- **Writes:** 3 concurrent (prevent race conditions)
- **Exec:** 5 concurrent
- **Total:** 15 concurrent operations max

### 6.5 Rate Limits
- **Per-tool:** 100 calls/minute
- **Per-session:** 1000 calls/hour
- **Backpressure:** Queue requests, return 429 if queue full

### 6.6 Output Truncation
- **Stdout/Stderr:** 1MB per exec, truncate with `...[truncated 2.3 MB]`
- **File Reads:** 10MB per file, return hash + metadata for larger
- **Search Results:** 1000 files max, paginate

### 6.7 Local-Only Mode
- **Default:** Content stays on device
- **Backend receives:** Tool call metadata, success/failure, byte counts, hashes
- **Explicit Opt-in:** Per-call flag `uploadContent: true` to send file contents to backend
- **Use Case:** Debugging, large file analysis (user must explicitly enable)

---

## 7. Session Lifecycle

### 7.1 Start Flow
1. **User Action:** Click "Connect → Local Environment"
2. **Backend:** Generate pairing code + PKCE challenge
3. **Frontend:** Display pairing code, QR code (optional)
4. **Launcher:** User enters code → generates device keypair
5. **Backend:** Validates code, stores device, returns tokens
6. **Launcher:** Receives `{deviceToken, sessionToken, mcpPort: 54321, nonce}`
7. **Launcher:** Starts MCP server on `127.0.0.1:54321`
8. **Launcher:** Sends `ready` signal to backend
9. **Backend:** Registers session, returns mode selection UI
10. **User:** Selects mode (Safe/Balanced/Unrestricted)
11. **Session Active:** Status pill appears, timer starts

### 7.2 Use Flow
1. **LLM Tool Call:** Gemini returns tool call in response
2. **Backend Detects:** Tool name starts with `fs.` or `exec.` or `git.`
3. **Backend Routes:** POST to `/api/mcp/proxy` with `{sessionToken, toolCall}`
4. **Backend Validates:** Session exists, not expired, mode allows operation
5. **Backend Proxies:** HTTP request to `127.0.0.1:mcpPort` (from launcher)
6. **Launcher Receives:** Validates nonce, checks policy, shows consent (if needed)
7. **MCP Executes:** Tool runs, returns result
8. **Launcher Logs:** Audit entry (immutable local log)
9. **Backend Returns:** Tool result to LLM (via SSE stream)
10. **LLM Continues:** Uses result in next turn

### 7.3 End Flow

**Timeout:**
- Session expires → backend rejects tool calls
- Launcher receives `session_expired` → shuts down MCP server
- Frontend shows: "Session expired, reconnect?"

**User Stop:**
- User clicks "Stop" → frontend calls `/api/devices/revoke?sessionToken=...`
- Backend revokes session → launcher receives `revoked` signal
- Launcher shuts down MCP server, clears tokens
- Frontend shows: "Disconnected"

**Browser Sign-Out:**
- User logs out → backend invalidates all sessions
- Launcher receives `revoked` → shuts down
- Frontend clears UI state

**Error Recovery:**
- Launcher crash → backend detects heartbeat failure → revokes session
- Network error → retry 3x, then fail gracefully
- MCP server error → return error to LLM, continue session

---

## 8. Security Hardening Checklist

### 8.1 Backend API (`/api/chat`, `/api/mcp/proxy`)

**Authentication:**
- ✅ Require session token on all endpoints
- ✅ Validate session expiry on every request
- ✅ Rate limit: 100 requests/minute per user
- ✅ Rate limit: 1000 tool calls/hour per device

**Headers:**
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `X-Frame-Options: DENY`
- ✅ `Strict-Transport-Security: max-age=31536000`
- ✅ `Content-Security-Policy: default-src 'self'`

**Error Sanitization:**
- ✅ Never return stack traces to client
- ✅ Never return file paths in errors (redact to `***/file.txt`)
- ✅ Never return command output in errors (redact to `[command output]`)
- ✅ Generic errors: "Tool execution failed" (details in server logs only)

**Input Validation:**
- ✅ Validate tool call schema before proxying
- ✅ Reject tool calls for non-existent tools
- ✅ Reject tool calls with invalid parameters
- ✅ Max request size: 10MB

### 8.2 Launcher

**Code Signing:**
- ✅ macOS: Notarized by Apple
- ✅ Windows: Signed with EV certificate
- ✅ Linux: GPG-signed package

**Auto-Update:**
- ✅ HTTPS-only update endpoint
- ✅ Verify signature before installing
- ✅ Rollback on failure
- ✅ User notification before update

**TLS / Signed Nonces:**
- ✅ MCP server uses TLS 1.3 (self-signed cert, launcher validates)
- ✅ Or: HMAC-SHA256 signed nonces per request
- ✅ Nonce: `{timestamp, random, signature}` (expires in 5 seconds)

**OS Permissions:**
- ✅ Request minimal permissions (file access, network localhost)
- ✅ Use OS permission prompts (not custom dialogs)
- ✅ Document required permissions in installer

**Audit Logs:**
- ✅ Immutable log: `~/.operastudio/audit.log` (append-only)
- ✅ Format: `{timestamp, userId, deviceId, tool, path, bytes, exitCode, consent}`
- ✅ Rotate: Keep last 30 days, compress older
- ✅ User can view/export logs

**Revocation:**
- ✅ Device token revocation → all sessions invalidated
- ✅ Session token revocation → immediate MCP shutdown
- ✅ User can revoke from web UI or launcher

### 8.3 Data Handling

**Never Upload by Default:**
- ✅ Tool results: Metadata only (path, size, hash, exit code)
- ✅ File contents: Only if `uploadContent: true` flag set
- ✅ Command output: Truncated to 1MB, never full output by default

**Explicit Opt-In:**
- ✅ Per-call flag: `uploadContent: true`
- ✅ User must enable in UI settings for persistent opt-in
- ✅ Show warning: "File contents will be sent to backend"

**Encryption:**
- ✅ Device tokens encrypted at rest (OS keychain)
- ✅ Session tokens: Short-lived, not stored
- ✅ Audit logs: Plaintext (user-readable)

### 8.4 Elevation

**Native OS Prompts:**
- ✅ macOS: `osascript` or Cocoa dialog
- ✅ Windows: `MessageBox` API
- ✅ Linux: `zenity` / `kdialog`

**Never Silent:**
- ✅ All elevation requires user interaction
- ✅ No background sudo/runas
- ✅ Show prompt even in Unrestricted mode (for critical operations)

---

## 9. Telemetry and Audit

### 9.1 Local Audit Log

**Location:** `~/.operastudio/audit.log` (append-only, immutable)

**Format (JSON Lines):**
```json
{"ts": 1706371200000, "userId": "user_123", "deviceId": "dev_456", "tool": "fs.write", "path": "/home/user/project/file.ts", "bytes": 1234, "consent": "user_approved", "exitCode": 0}
{"ts": 1706371201000, "userId": "user_123", "deviceId": "dev_456", "tool": "exec.run", "cmd": "npm install", "cwd": "/home/user/project", "exitCode": 0, "stdoutBytes": 45678}
```

**Fields:**
- `ts`: Unix timestamp (milliseconds)
- `userId`: User identifier (from session)
- `deviceId`: Device identifier
- `tool`: Tool name (`fs.read`, `exec.run`, etc.)
- `path`: File path (redacted if deny-listed)
- `bytes`: Bytes read/written
- `consent`: `auto_approved`, `user_approved`, `user_denied`
- `exitCode`: Process exit code (for exec)
- `stdoutBytes`: Stdout size (truncated if > 1MB)

**Retention:** 30 days, then compress to `.log.gz`, keep 1 year

**User Access:**
- View in launcher UI: "View Audit Log"
- Export: JSON or CSV format
- Search: By date, tool, path pattern

### 9.2 Backend Telemetry (Redacted)

**What We Send:**
- Tool call counts (per tool, per session)
- Success/failure rates
- Session duration
- Mode distribution (Safe/Balanced/Unrestricted)
- Error codes (generic, no paths)

**What We Don't Send:**
- File paths
- File contents
- Command arguments
- User identifiers (anonymized)

**Format:**
```json
{
  "sessionId": "anon_session_abc123",
  "toolCalls": {"fs.read": 45, "exec.run": 3},
  "successRate": 0.98,
  "durationMs": 3600000,
  "mode": "balanced"
}
```

**Opt-In:**
- User can disable in settings
- Default: Enabled (for product improvement)

---

## 10. User Experience Script

### 10.1 First Run

**Step 1: Install Launcher**
- User downloads installer (or installs extension)
- Installer runs, requests OS permissions
- Launcher appears in system tray/menu bar

**Step 2: Connect from Web**
- User opens web app, clicks "Connect → Local Environment"
- Web shows: "Enter this code in your launcher: **ABC-1234**"
- QR code displayed (optional, for mobile launcher)

**Step 3: Pair Device**
- User opens launcher, sees "Enter Pairing Code" screen
- User enters code
- Launcher shows: "Connecting..." → "Connected to OperaStudio"
- Web shows: "Device paired! Select your security mode:"

**Step 4: Select Mode**
- Web shows three cards:
  - **Safe:** Confirm every operation
  - **Balanced:** Auto-approve reads, confirm writes/exec (Recommended)
  - **Unrestricted:** Full access, 15-minute timer
- User selects "Balanced"
- Web shows: "✅ Local Environment Connected [Balanced] [1h remaining]"

### 10.2 Returning Session

**Step 1: Auto-Reconnect**
- User opens web app (already authenticated)
- Backend checks: Active device token exists?
- If yes: Show "Reconnect to Local Environment?" button
- User clicks → Launcher receives reconnect signal → MCP starts → Session active

**Step 2: Device List**
- Web shows: "Connected Devices" sidebar
- List: Device name, OS, last used, "Revoke" button
- User can revoke any device

### 10.3 Active Session

**Status Pill:**
```
[🟢 Local Environment] [Balanced] [45m remaining] [⏸ Pause] [⏹ Stop]
```

**Consent Prompt (Balanced Mode - Write):**
```
⚠️ Write Operation

File: src/components/Button.tsx
Change: +5 lines, -2 lines
Preview: [Show Diff]

[Allow Once] [Allow for Session] [Deny]
```

**Toast (Auto-Approved Read):**
```
✓ Read: README.md (2.1 KB)
```

**Capability Panel:**
- Click status pill → Shows:
  - Tools available: fs.read, fs.write, exec.run, git.*
  - Session stats: 23 reads, 5 writes, 2 execs
  - Data usage: 12 MB read, 3 MB written
  - Audit log: "View Log" button

### 10.4 Post-Run Receipt

**Session End:**
- User clicks "Stop" or session expires
- Web shows modal:
  ```
  Session Summary
  
  Duration: 1h 23m
  Operations: 45 reads, 12 writes, 3 execs
  Data: 45 MB read, 8 MB written
  
  [View Audit Log] [Close]
  ```

**Audit Log View:**
- Table: Timestamp, Tool, Path, Size, Consent, Status
- Filter: By tool, date range
- Export: JSON, CSV

---

## 11. Risk Register

### Risk 1: Abusive Prompts
**Description:** User prompts LLM to delete all files or run malicious commands.

**Mitigations:**
- Deny-list system roots (`/System`, `/Windows`, `/usr/bin`)
- Pre-execution dry-run shows diff/command preview
- Consent prompts (Safe/Balanced modes)
- Rate limits (1000 calls/hour)
- Session timeboxing (1 hour max, 15 min for Unrestricted)

**Severity:** High  
**Likelihood:** Medium  
**Status:** Mitigated

---

### Risk 2: Path Traversal
**Description:** Malicious tool calls use `../` to escape allowed directories.

**Mitigations:**
- Normalize all paths: resolve `..`, `.`, symlinks
- Validate paths against deny-list after normalization
- Reject paths outside user home (unless explicit allow-list)
- Audit log records original + normalized path

**Severity:** High  
**Likelihood:** Low  
**Status:** Mitigated

---

### Risk 3: Infinite Writes
**Description:** Tool call writes massive files, fills disk.

**Mitigations:**
- Per-call limit: 10MB write
- Per-session limit: 50MB written
- Pre-execution byte count shown to user
- Disk space check before write (warn if < 1GB free)

**Severity:** Medium  
**Likelihood:** Low  
**Status:** Mitigated

---

### Risk 4: Long-Running Execs
**Description:** Command runs indefinitely, consumes resources.

**Mitigations:**
- Timeout: 5 minutes per exec (configurable)
- Max concurrent execs: 5
- Pre-execution shows estimated runtime (if detectable)
- User can cancel exec mid-run (SIGTERM)

**Severity:** Medium  
**Likelihood:** Medium  
**Status:** Mitigated

---

### Risk 5: Data Exfiltration
**Description:** Malicious actor uses tool calls to read secrets, upload to backend.

**Mitigations:**
- Default: Never upload file contents (metadata only)
- Explicit opt-in required: `uploadContent: true` flag
- Deny-list secrets directories (`~/.ssh`, `~/.aws`)
- Audit log records all reads (user can review)
- User warning: "File contents will be sent to backend" (if opt-in enabled)

**Severity:** High  
**Likelihood:** Low  
**Status:** Mitigated

---

### Risk 6: Session Hijacking
**Description:** Attacker steals session token, makes tool calls.

**Mitigations:**
- Session tokens: Short-lived (1 hour), refreshable
- Device tokens: Mutual auth (signed nonces)
- HTTPS only (TLS 1.3)
- Revocation: Immediate via web UI or launcher
- Audit log: Records all tool calls (detect anomalies)

**Severity:** High  
**Likelihood:** Low  
**Status:** Mitigated

---

### Risk 7: Launcher Compromise
**Description:** Malicious code in launcher bypasses policy.

**Mitigations:**
- Code signing: Verify signature on launch
- Auto-update: Signed updates only
- Minimal permissions: Launcher runs with user privileges (not root)
- Sandboxing: OS-level sandbox (if available)
- Audit log: Immutable, append-only

**Severity:** Critical  
**Likelihood:** Very Low  
**Status:** Partially Mitigated (requires OS-level hardening)

---

## 12. Interoperability

### 12.1 MCP Protocol
- **Keep MCP:** Model-facing tools remain MCP-compliant
- **Standard:** JSON-RPC 2.0, tool discovery, schemas
- **Future-Proof:** Swap Gemini for Claude/GPT-4 → same tool interface

### 12.2 Private Binary Side-Channel (Optional)
- **Use Case:** Large file transfers (>10MB)
- **Protocol:** WebSocket binary stream, separate from MCP
- **Endpoint:** `ws://127.0.0.1:mcpPort/transfer`
- **Auth:** Same session token
- **Flow:**
  1. MCP tool call returns: `{transferId: "abc123", size: 50000000}`
  2. Backend opens WebSocket to `/transfer?transferId=abc123`
  3. Launcher streams file chunks
  4. Backend receives, forwards to LLM (or stores temporarily)

**Tradeoff:** Adds complexity, but enables large file analysis without MCP protocol overhead.

### 12.3 Provider Swap
- **Current:** Gemini 2.5 Flash
- **Future:** Claude, GPT-4, local models
- **Compatibility:** Tool calls are provider-agnostic (MCP standard)
- **No Changes:** Launcher/MCP server unchanged when swapping providers

---

## 13. Acceptance Criteria

### ✅ AC1: Authentication Required
- Cannot invoke local tools unless user is authenticated (session token valid)
- Cannot invoke local tools unless device is paired (device token valid)
- Unauthenticated requests return 401

### ✅ AC2: Unrestricted Timeboxing
- Unrestricted sessions expire after 15 minutes
- Timer visible in status pill (countdown)
- Large "Stop" button always visible
- Session terminates immediately on expiry or stop

### ✅ AC3: Consent Modes
- **Safe:** Every operation prompts (reads, writes, exec)
- **Balanced:** Reads auto-approve, writes/exec prompt
- **Unrestricted:** All auto-approve (timeboxed)
- Consent prompts show diff/command preview

### ✅ AC4: Immediate Revocation
- Revoking device token → all sessions invalidated immediately
- Revoking session token → MCP server shuts down within 1 second
- Frontend shows "Disconnected" state
- No tool calls possible after revocation

### ✅ AC5: Error Sanitization
- No stack traces in client responses
- No file paths in errors (redacted: `***/file.txt`)
- No command output in errors (redacted: `[command output]`)
- Generic messages: "Tool execution failed" (details in server logs)

---

## Open Questions

### Q1: Launcher Distribution Strategy
**Decision Needed:** Which launcher option(s) to support?
- **Options:** Browser Extension, Custom Protocol Handler, IDE Extension, Resident Daemon
- **Recommendation:** Start with Custom Protocol Handler (Option B) for MVP, add Browser Extension later
- **Owner:** Product + Engineering Lead

### Q2: MCP Server Implementation Language
**Decision Needed:** What language/framework for MCP server?
- **Options:** Node.js (TypeScript), Rust, Go, Python
- **Considerations:** Performance, security, cross-platform, maintenance
- **Recommendation:** Rust (performance, security, cross-platform) or Node.js (faster iteration, existing codebase)
- **Owner:** Engineering Lead

### Q3: Session Token Refresh Strategy
**Decision Needed:** How to handle session token refresh?
- **Options:** Silent refresh (background), Explicit refresh (user action), No refresh (reconnect)
- **Recommendation:** Silent refresh if user is still authenticated, else require reconnect
- **Owner:** Backend Lead

### Q4: Large File Handling Default
**Decision Needed:** Default behavior for files >10MB?
- **Options:** Return hash + metadata, Return truncated preview, Require explicit opt-in flag
- **Recommendation:** Return hash + metadata, require explicit `fullContent: true` flag
- **Owner:** Product Lead

### Q5: Audit Log Retention Policy
**Decision Needed:** How long to keep audit logs?
- **Options:** 30 days (current), 90 days, 1 year, User-configurable
- **Recommendation:** 30 days active, 1 year compressed, user-configurable
- **Owner:** Security Lead

### Q6: Telemetry Opt-In Default
**Decision Needed:** Default telemetry setting?
- **Options:** Opt-in (default off), Opt-out (default on)
- **Recommendation:** Opt-out (default on) with clear disclosure, easy toggle
- **Owner:** Product + Legal

### Q7: Binary Side-Channel Priority
**Decision Needed:** Implement binary side-channel for large files?
- **Options:** MVP (no), v1.1 (yes), Never
- **Recommendation:** Defer to v1.1, start with MCP-only
- **Owner:** Engineering Lead

### Q8: Corporate Deployment Model
**Decision Needed:** How to support enterprise deployments?
- **Options:** Self-hosted backend, On-premise launcher, MDM integration
- **Recommendation:** Start with cloud-only, add self-hosted backend later
- **Owner:** Product + Sales

---

**End of Blueprint**

