# Implementation Plan: Local Environment Connector

**Version:** 1.0  
**Date:** 2025-01-27  
**Status:** Planning Phase

---

## Table of Contents

1. [Pre-Build Gates](#pre-build-gates)
2. [Phase 0: Operational Setup](#phase-0--operational-setup)
3. [Phase 1: Backend Scaffolding](#phase-1--backend-scaffolding)
4. [Phase 2: Launcher MVP](#phase-2--launcher-mvp)
5. [Phase 3: Transport + Pairing](#phase-3--transport--pairing)
6. [Phase 4: MCP Façade with Minimal Tools](#phase-4--mcp-façade-with-minimal-tools)
7. [Phase 5: Consent and Risk Actions](#phase-5--consent-and-risk-actions)
8. [Phase 6: Observability and Rollback](#phase-6--observability-and-rollback)
9. [Phase 7: Beta Channel](#phase-7--beta-channel)
10. [Smoke Tests](#smoke-tests)

---

## Pre-Build Gates

**Status:** ⏳ Pending Verification

### Verification Checklist

✅ **Apple Code-Signing Certificate**
- [ ] Developer ID Application certificate obtained
- [ ] Certificate installed in keychain
- [ ] Notarization credentials configured
- [ ] Certificate expiration date tracked
- [ ] Renewal process documented

✅ **Windows Code-Signing Certificate**
- [ ] EV certificate obtained (or standard certificate)
- [ ] Certificate installed in certificate store
- [ ] Timestamp server configured
- [ ] Certificate expiration date tracked
- [ ] Renewal process documented

✅ **Update Feed Infrastructure**
- [ ] Production feed endpoint: `updates.operastudio.app`
- [ ] Beta feed endpoint: `beta.operastudio.app`
- [ ] Update manifest format defined (JSON)
- [ ] 3-version retention policy implemented
- [ ] CDN/distribution configured
- [ ] Update feed authentication/authorization

✅ **Protocol Scheme Registration**
- [ ] Scheme reserved: `operastudio://`
- [ ] macOS: `Info.plist` CFBundleURLSchemes configured
- [ ] Linux: `.desktop` file MimeType configured
- [ ] Windows: Registry entry configured
- [ ] Documentation updated with scheme details
- [ ] Scheme collision check completed

✅ **HMAC Transport Specification**
- [ ] Token claims structure finalized
- [ ] TTLs defined: 60s token, 10s replay window, ±30s clock skew
- [ ] Signature algorithm: HMAC-SHA256
- [ ] Secret exchange protocol defined
- [ ] Origin pinning mechanism specified
- [ ] Failure taxonomy documented

✅ **UX Specification Approved**
- [ ] Home root (`~`) as default confirmed
- [ ] Split view layout (50/50, 30/70, 70/30) approved
- [ ] Consent modes (Safe/Balanced/Unrestricted) approved
- [ ] File tree interaction model approved
- [ ] Approval sheet designs approved
- [ ] Status pill design approved

**Gate Status:** All items must be verified before Phase 0 begins.

---

## Phase 0 — Operational Setup

**Goal:** Establish infrastructure for code signing, updates, and logging.

**Duration:** 2-3 weeks

### Tasks

**1. Sign + Notarize Pipeline (macOS, Windows)**

**macOS:**
- [ ] Configure Xcode build settings for code signing
- [ ] Implement notarization step in CI/CD pipeline
- [ ] Test notarization with Apple's servers
- [ ] Handle notarization failures gracefully
- [ ] Document notarization process

**Windows:**
- [ ] Configure code signing in build process
- [ ] Implement timestamp server integration
- [ ] Test signing with EV certificate
- [ ] Handle signing failures gracefully
- [ ] Document signing process

**Deliverables:**
- Automated signing pipeline in CI/CD
- Notarization integration for macOS
- Signed binaries for all platforms
- Documentation for signing process

**2. Auto-Update Service with Beta Feed**

**Infrastructure:**
- [ ] Set up production update feed (`updates.operastudio.app`)
- [ ] Set up beta update feed (`beta.operastudio.app`)
- [ ] Implement update manifest generation
- [ ] Implement 3-version retention policy
- [ ] Set up CDN/distribution for binaries

**Launcher Integration:**
- [ ] Implement update check mechanism
- [ ] Implement update download and verification
- [ ] Implement atomic binary replacement
- [ ] Implement update rollback mechanism
- [ ] Implement channel selection (stable/beta)

**Deliverables:**
- Update feed endpoints operational
- Launcher can check for updates
- Launcher can download and install updates
- Update rollback functional

**3. Crash Reporting and Hash-Chained Local Logs**

**Crash Reporting:**
- [ ] Integrate crash reporting service (e.g., Sentry, Crashlytics)
- [ ] Configure crash symbolication
- [ ] Set up crash alerting
- [ ] Implement crash rate monitoring

**Hash-Chained Logs:**
- [ ] Implement append-only audit log format
- [ ] Implement hash chaining (hashPrev, hashThis)
- [ ] Implement log rotation (30 days, compress older)
- [ ] Implement log export (JSON/CSV)
- [ ] Implement log viewer in launcher UI

**Deliverables:**
- Crash reporting integrated
- Hash-chained audit logs functional
- Log rotation and export working
- Log viewer UI implemented

### Acceptance Criteria

✅ **Signing Pipeline:**
- macOS binaries notarized successfully
- Windows binaries signed successfully
- Signing failures handled gracefully
- Documentation complete

✅ **Update Service:**
- Launcher checks for updates on start
- Updates download and install correctly
- Rollback works on update failure
- Beta channel accessible (opt-in)

✅ **Logging:**
- Audit logs are append-only
- Hash chaining verified (tamper detection)
- Log rotation works correctly
- Log export functional

---

## Phase 1 — Backend Scaffolding (No Tools Yet)

**Goal:** Build database schema and API endpoints for device/session management.

**Duration:** 1-2 weeks

### Database Schema

**Tables:**

**`devices`**
```sql
- id (UUID, PK)
- user_id (string, FK to Clerk)
- device_name (string)
- device_public_key (text, Ed25519)
- status (enum: pending, active, revoked)
- os (string: darwin, linux, win32)
- arch (string: amd64, arm64)
- hostname (string)
- launcher_version (string)
- paired_at (timestamp)
- last_seen_at (timestamp)
- revoked_at (timestamp, nullable)
- revocation_reason (string, nullable)
- rotation_count (integer, default 0)
- created_at (timestamp)
- updated_at (timestamp)
```

**`device_keys`**
```sql
- id (UUID, PK)
- device_id (UUID, FK to devices)
- public_key (text, Ed25519)
- private_key_encrypted (text, encrypted)
- expires_at (timestamp)
- revoked_at (timestamp, nullable)
- created_at (timestamp)
```

**`local_sessions`**
```sql
- id (UUID, PK)
- device_id (UUID, FK to devices)
- user_id (string, FK to Clerk)
- session_secret (text, encrypted)
- mcp_port (integer)
- mode (enum: safe, balanced, unrestricted)
- duration_minutes (integer)
- status (enum: active, ended, revoked)
- started_at (timestamp)
- ended_at (timestamp, nullable)
- created_at (timestamp)
- updated_at (timestamp)
```

**`tool_runs`**
```sql
- id (UUID, PK)
- session_id (UUID, FK to local_sessions)
- user_id (string, FK to Clerk)
- device_id (UUID, FK to devices)
- tool (string: fs.read, exec.run, etc.)
- args_hash (string, SHA256)
- paths_touched_count (integer)
- bytes_read (bigint)
- bytes_written (bigint)
- exit_code (integer, nullable)
- status (enum: success, error, cancelled)
- elevated (boolean, default false)
- duration_ms (integer)
- created_at (timestamp)
```

### API Endpoints

**`POST /api/devices/pair`**
- Input: `{nonce, devicePublicKey, proof, deviceMetadata}`
- Output: `{deviceId, deviceToken}`
- Auth: Clerk session required
- Validates: Nonce signature, PKCE proof
- Creates: Device record, device key record

**`POST /api/sessions/start`**
- Input: `{deviceToken, sessionSecret, mcpPort}`
- Output: `{sessionId, sessionToken}`
- Auth: Device token required
- Validates: Device token, device status
- Creates: Session record

**`POST /api/sessions/stop`**
- Input: `{sessionId, sessionToken}`
- Output: `{receipt}`
- Auth: Session token required
- Updates: Session status → ended
- Generates: Session receipt

**`POST /api/sessions/heartbeat`**
- Input: `{sessionId, sessionToken}`
- Output: `{status: "active"}` or `{status: "revoked"}`
- Auth: Session token required
- Updates: Session `updated_at`, device `last_seen_at`
- Frequency: Every 30 seconds

**`POST /api/devices/revoke`**
- Input: `{deviceId}`
- Output: `{status: "revoked"}`
- Auth: Clerk session required (user revokes own device)
- Updates: Device status → revoked, all active sessions → revoked

### SSE Schema for Tool-Run Events

**Event Types:**

**`tool.start`**
```json
{
  "type": "tool.start",
  "sessionId": "session_abc123",
  "tool": "fs.read",
  "args": {"path": "src/index.ts"}
}
```

**`tool.chunk`**
```json
{
  "type": "tool.chunk",
  "sessionId": "session_abc123",
  "data": "file content chunk..."
}
```

**`tool.complete`**
```json
{
  "type": "tool.complete",
  "sessionId": "session_abc123",
  "result": {"content": "...", "size": 1234}
}
```

**`tool.error`**
```json
{
  "type": "tool.error",
  "sessionId": "session_abc123",
  "error": "NOT_FOUND",
  "message": "File not found: src/index.ts"
}
```

### Acceptance Criteria

✅ **Database Schema:**
- All tables created with correct schema
- Foreign keys and indexes configured
- Migrations tested and documented

✅ **API Endpoints:**
- All endpoints implemented and tested
- Authentication/authorization working
- Error handling implemented
- Rate limiting configured

✅ **Session Management:**
- Sessions time-boxed (enforced by backend)
- Revoke stops all active sessions immediately
- Heartbeat updates session/device timestamps
- Session receipts generated on stop

✅ **Auth Required:**
- All endpoints require Clerk authentication
- Device pairing requires valid session
- Session start requires valid device token
- Unauthenticated requests return 401

---

## Phase 2 — Launcher MVP (Protocol Handler)

**Goal:** Build minimal launcher that opens from protocol handler and starts localhost server.

**Duration:** 2-3 weeks

### Tasks

**1. Protocol Handler Registration**

**macOS:**
- [ ] Add `CFBundleURLSchemes` to `Info.plist`
- [ ] Register `operastudio://` scheme
- [ ] Test protocol handler invocation

**Linux:**
- [ ] Create `.desktop` file with MimeType
- [ ] Register protocol handler via `xdg-mime`
- [ ] Test protocol handler invocation

**Windows:**
- [ ] Create registry entry for `operastudio://`
- [ ] Register protocol handler
- [ ] Test protocol handler invocation

**2. Micro-Launcher Core**

**Protocol Handler:**
- [ ] Parse `operastudio://connect?nonce=...&user=...&origin=...`
- [ ] Extract nonce, userId, origin from URL
- [ ] Validate nonce signature
- [ ] Check nonce TTL (60s window)

**Localhost Server:**
- [ ] Start HTTP/WebSocket server on `127.0.0.1`
- [ ] Bind to random high port (49152-65535)
- [ ] Generate per-session HMAC secret
- [ ] Exchange secret with backend

**3. Health Endpoint**

**`GET /health`**
- [ ] Return: `{status, version, sessionId, uptime, mode}`
- [ ] Used by backend for heartbeat
- [ ] Responds within 100ms

**4. Consent UI**

**Mode Selection:**
- [ ] Display mode selection dialog (Safe/Balanced/Unrestricted)
- [ ] User selects mode
- [ ] If Unrestricted: User sets duration (10-30 min)
- [ ] Send mode selection to backend

**Timer Display:**
- [ ] Show countdown timer in UI
- [ ] Update every second
- [ ] Format: `mm:ss` or `hh:mm:ss`

**Kill Switch:**
- [ ] Large "Stop" button visible
- [ ] On click: Terminate MCP server, end session
- [ ] Send stop signal to backend

**5. Child Process Management**

**Process Tracking:**
- [ ] Track all child processes (MCP server, commands)
- [ ] On stop: Kill all child processes
- [ ] On crash: Clean up orphaned processes

### Acceptance Criteria

✅ **Protocol Handler:**
- Launcher opens from `operastudio://connect?...`
- Nonce validation works correctly
- Connection established in ≤3 seconds

✅ **Localhost Server:**
- Server starts on random high port
- Health endpoint responds correctly
- HMAC secret exchange works

✅ **Consent UI:**
- Mode selection dialog displays
- Timer visible and updates correctly
- Kill switch terminates session

✅ **Process Management:**
- Child processes tracked
- Stop kills all child processes
- Cleanup on crash works

---

## Phase 3 — Transport + Pairing

**Goal:** Implement secure HMAC transport and device pairing flow.

**Duration:** 2-3 weeks

### Tasks

**1. HMAC Handshake**

**Token Format:**
- [ ] Implement token claims structure
- [ ] Implement HMAC-SHA256 signing
- [ ] Implement token validation
- [ ] Implement replay window (10s)
- [ ] Implement clock skew tolerance (±30s)

**Secret Exchange:**
- [ ] Generate 32-byte random secret
- [ ] Encrypt secret for storage (OS keychain)
- [ ] Exchange secret with backend (HTTPS)
- [ ] Store secret per session

**2. Origin Pinning**

**Origin Validation:**
- [ ] Extract origin from protocol URL
- [ ] Include origin in token claims
- [ ] Verify origin on every request
- [ ] Reject requests with origin mismatch

**3. Loopback Bind**

**Network Binding:**
- [ ] Bind to `127.0.0.1` only
- [ ] Reject connections from other IPs
- [ ] Use random high port (49152-65535)
- [ ] Communicate port to backend

**4. Device Pairing**

**PKCE-Style Proof:**
- [ ] Generate Ed25519 keypair
- [ ] Compute proof: `HMAC-SHA256(nonce + devicePublicKey, devicePrivateKey)`
- [ ] Send proof to backend
- [ ] Receive device token

**Key Storage:**
- [ ] Encrypt device private key (OS keychain)
- [ ] Store device token (encrypted)
- [ ] Store device ID (plaintext)

**Key Rotation:**
- [ ] Implement 90-day rotation (optional)
- [ ] Generate new keypair on rotation
- [ ] Issue new device token
- [ ] Invalidate old token after grace period (7 days)

**5. Revocation**

**Revocation Handling:**
- [ ] Listen for revocation signals from backend
- [ ] On revocation: Terminate MCP server
- [ ] Clear device token locally
- [ ] Shut down launcher (or wait for re-pair)

**6. Heartbeat and Idle Timeout**

**Heartbeat:**
- [ ] Send heartbeat every 30 seconds
- [ ] Update device `last_seen_at`
- [ ] Handle heartbeat failures

**Idle Timeout:**
- [ ] Track last activity timestamp
- [ ] On idle timeout (5 min): End session
- [ ] Notify backend of timeout

### Acceptance Criteria

✅ **HMAC Transport:**
- Tokens signed and validated correctly
- Replay attacks blocked (10s window)
- Clock skew handled (±30s tolerance)
- Secret exchange secure

✅ **Origin Pinning:**
- Origin validated on every request
- Origin mismatch rejected
- Cross-origin attacks prevented

✅ **Device Pairing:**
- PKCE proof works correctly
- Device token issued after pairing
- Key rotation functional (if enabled)
- Revocation severs connection immediately

✅ **Heartbeat:**
- Heartbeat sent every 30 seconds
- Idle timeout ends session after 5 min
- Revoked device cannot start sessions

---

## Phase 4 — MCP Façade with Minimal Tools

**Goal:** Implement MCP server with basic file system tools.

**Duration:** 2-3 weeks

### Tasks

**1. MCP Server Core**

**Server Setup:**
- [ ] Start MCP server on localhost
- [ ] Implement JSON-RPC 2.0 protocol
- [ ] Implement tool discovery endpoint
- [ ] Implement tool execution endpoint

**2. Minimal Tools**

**`fs.list`**
- [ ] List directory contents
- [ ] Support depth parameter (max 5)
- [ ] Support `includeHidden` parameter
- [ ] Return: `{items: [{path, type, size, mtime, permissions}]}`
- [ ] Paginate large directories (>1000 items)

**`fs.read`**
- [ ] Read file contents (text only)
- [ ] Support `maxBytes` parameter (default 10MB)
- [ ] Return: `{content: string, size: number, type: string}`
- [ ] Truncate large files (>10MB)

**`ping`**
- [ ] Simple health check tool
- [ ] Return: `{pong: true, timestamp: ...}`
- [ ] Used for connection testing

**3. Policy Engine**

**Deny-Lists:**
- [ ] Implement system roots deny-list (OS-specific)
- [ ] Implement secrets patterns deny-list
- [ ] Check deny-list before tool execution
- [ ] Reject denied paths with `PERMISSION_DENIED`

**Size Limits:**
- [ ] Enforce `maxBytes` per read
- [ ] Enforce session quotas (100MB read, 10MB write)
- [ ] Reject oversized operations

**Truncation:**
- [ ] Truncate large outputs (>10MB)
- [ ] Show truncation indicator
- [ ] Return hash + metadata for truncated content

**Privacy Default:**
- [ ] Default: Do not upload file contents
- [ ] Only metadata sent (path, size, type)
- [ ] User must explicitly toggle per call

**4. UX Integration**

**Sidebar File Tree:**
- [ ] Switch sidebar to file tree on connect
- [ ] Root tree at Home (`~`)
- [ ] Implement expand/collapse
- [ ] Implement search/filter

**File Opening:**
- [ ] Click file → Opens in editor tab
- [ ] Post system message: "Opened: filename.ext (size, type)"
- [ ] Update `cwd` and `selection` state

**Path Resolution:**
- [ ] Resolve relative paths from `cwd`
- [ ] Handle `~`, `./`, `../` special paths
- [ ] Handle ambiguous names (multiple matches)
- [ ] Handle nonexistent paths

### Acceptance Criteria

✅ **MCP Server:**
- Server starts and responds to tool calls
- Tool discovery works correctly
- JSON-RPC 2.0 protocol implemented

✅ **Tools:**
- `fs.list` works correctly
- `fs.read` reads text files correctly
- `ping` responds correctly
- Large folders paginate (>1000 items)

✅ **Policy:**
- Deny-lists block system roots and secrets
- Size limits enforced
- Truncation works for large files
- Privacy default: No file contents uploaded

✅ **UX:**
- Sidebar switches to Home-rooted tree
- File opening posts system note
- Relative path resolution from `cwd` works
- Large folders paginate correctly

---

## Phase 5 — Consent and Risk Actions

**Goal:** Implement consent dialogs and enforce mode-based policies.

**Duration:** 2-3 weeks

### Tasks

**1. Write Operations**

**`fs.write`**
- [ ] Implement file write tool
- [ ] Support full content and patch modes
- [ ] Generate diff preview (before/after)
- [ ] Show byte counts
- [ ] Require approval in Safe/Balanced modes

**Diff Preview:**
- [ ] Compute unified diff
- [ ] Highlight additions/deletions
- [ ] Show context lines (3 above/below)
- [ ] Display in approval sheet

**2. Execution Operations**

**`exec.run`**
- [ ] Implement command execution tool
- [ ] Support command, args, cwd, timeout
- [ ] Resolve binary path
- [ ] Show command preview
- [ ] Require approval in Safe/Balanced modes

**Command Preview:**
- [ ] Display command name
- [ ] Display arguments
- [ ] Display working directory
- [ ] Display resolved binary path
- [ ] Display timeout value

**3. Elevation Preview**

**Elevation Detection:**
- [ ] Detect commands requiring elevation
- [ ] Show elevation preview before OS prompt
- [ ] Display command name and binary path
- [ ] User confirms: "Continue" or "Cancel"

**OS Prompt:**
- [ ] Trigger OS elevation prompt (macOS/Linux/Windows)
- [ ] Log elevation requests in audit log
- [ ] Flag elevated commands in session receipt

**4. Mode Enforcement**

**Safe Mode:**
- [ ] Prompt for every write/exec
- [ ] Show diff/command preview
- [ ] Require user approval
- [ ] Log all approvals

**Balanced Mode:**
- [ ] Auto-approve reads
- [ ] Prompt for writes/exec
- [ ] Show diff/command preview
- [ ] Require user approval for writes/exec

**Unrestricted Mode:**
- [ ] Auto-approve all operations
- [ ] Show toast notifications for destructive actions
- [ ] Time-boxed (10 min default, max 30 min per 24h)
- [ ] Visible countdown timer
- [ ] Kill switch available

**5. Receipt Generation**

**Session Receipt:**
- [ ] Collect all writes during session
- [ ] Collect all executions during session
- [ ] Calculate bytes read/written
- [ ] Generate receipt on session end
- [ ] Include actions: "Open changed files", "Revert changes"

### Acceptance Criteria

✅ **Write Operations:**
- `fs.write` works correctly
- Diff preview shows before/after
- Byte counts displayed
- Approval required in Safe/Balanced modes

✅ **Execution Operations:**
- `exec.run` works correctly
- Command preview shows all details
- Approval required in Safe/Balanced modes
- Timeout enforced

✅ **Elevation:**
- Elevation preview shown before OS prompt
- OS prompt triggered correctly
- Elevation logged in audit log

✅ **Mode Enforcement:**
- Safe mode prompts all writes/exec
- Balanced mode prompts writes/exec only
- Unrestricted mode auto-approves (time-boxed)
- Destructive actions blocked until approved (except Unrestricted)

✅ **Receipts:**
- Receipts generated on session end
- Receipts include all changes
- Receipt actions work correctly

---

## Phase 6 — Observability and Rollback

**Goal:** Implement audit logging and update rollback mechanisms.

**Duration:** 2-3 weeks

### Tasks

**1. Local Append-Only Audit Log**

**Log Format:**
- [ ] Implement JSON Lines format
- [ ] Include all required fields (userId, deviceId, sessionId, tool, etc.)
- [ ] Implement hash chaining (hashPrev, hashThis)
- [ ] Append-only enforcement (no modifications)

**Log Rotation:**
- [ ] Keep 30 days of logs
- [ ] Compress older logs (gzip)
- [ ] Archive compressed logs (1 year retention)
- [ ] User can export logs (JSON/CSV)

**Log Viewer:**
- [ ] Implement log viewer in launcher UI
- [ ] Filter by date, tool, status
- [ ] Search functionality
- [ ] Export functionality

**2. Remote Head-Hash Attestation (Optional)**

**Attestation:**
- [ ] Compute head hash of audit log
- [ ] Send head hash to backend on session end
- [ ] Backend stores attestation record
- [ ] User can verify attestation (compare local vs remote)

**3. Auto-Rollback on Failed Launch**

**Failure Detection:**
- [ ] Detect integrity check failure (signature/checksum)
- [ ] Detect startup crash (twice consecutively)
- [ ] Detect handshake failure (cannot authenticate)
- [ ] Detect health check failure

**Rollback Process:**
- [ ] Stop current launcher process
- [ ] Restore previous version from `~/.operastudio/versions/`
- [ ] Verify restored binary signature
- [ ] Start restored version
- [ ] Log rollback event

**4. Manual Rollback**

**User-Initiated:**
- [ ] Add "Revert to previous version" in launcher settings
- [ ] Show list of available versions (3 kept)
- [ ] User selects version to revert to
- [ ] Confirm rollback action
- [ ] Execute rollback process

**Rollback UI:**
- [ ] Display current version
- [ ] Display available previous versions
- [ ] Show version details (date, size, hash)
- [ ] Confirm rollback dialog

### Acceptance Criteria

✅ **Audit Logging:**
- Logs are append-only (no modifications)
- Hash chaining verified (tamper detection)
- Log rotation works correctly
- Log export functional

✅ **Attestation:**
- Head hash computed correctly
- Attestation sent to backend
- User can verify attestation

✅ **Auto-Rollback:**
- Failed update rolls back automatically
- Integrity check failure triggers rollback
- Startup crash triggers rollback
- Handshake failure triggers rollback

✅ **Manual Rollback:**
- User can revert to previous version
- Rollback succeeds correctly
- Previous version functional after rollback

---

## Phase 7 — Beta Channel

**Goal:** Implement opt-in beta channel for advanced users.

**Duration:** 1-2 weeks

### Tasks

**1. Opt-In Toggle**

**UI:**
- [ ] Add "Beta Channel" toggle in launcher settings
- [ ] Show warning: "Beta builds may be unstable"
- [ ] Require user confirmation
- [ ] Persist channel selection

**Backend:**
- [ ] Store channel preference per device
- [ ] Return appropriate update feed based on channel
- [ ] Never auto-enroll production users

**2. Beta Watermark**

**Visual Marking:**
- [ ] Display "BETA" badge in launcher UI
- [ ] Display beta version in about dialog
- [ ] Mark beta builds in logs
- [ ] Show beta indicator in status

**3. Separate Feed**

**Update Feed:**
- [ ] Beta feed: `beta.operastudio.app`
- [ ] Production feed: `updates.operastudio.app`
- [ ] Launcher checks appropriate feed based on channel
- [ ] Beta builds signed separately (if needed)

**4. Channel Switching**

**Switch to Beta:**
- [ ] User enables beta channel
- [ ] Launcher checks beta feed
- [ ] Downloads beta update (if available)
- [ ] Installs beta version
- [ ] Preserves device pairing

**Switch to Stable:**
- [ ] User disables beta channel
- [ ] Launcher checks stable feed
- [ ] Downloads stable update (if newer)
- [ ] Installs stable version
- [ ] Preserves device pairing

### Acceptance Criteria

✅ **Beta Channel:**
- Opt-in toggle works correctly
- Beta watermark displayed
- Separate feed functional
- Channel switching updates correctly

✅ **Pairing Preservation:**
- Device pairing preserved on channel switch
- Sessions continue after channel switch
- No re-pairing required

---

## Smoke Tests

**Status:** ⏳ Must Pass Before Production Release

### Test 1: Connect and Path Resolution

**Steps:**
1. User clicks "Connect to File System"
2. Launcher opens, validates nonce
3. Session established
4. Sidebar switches to file tree (rooted at Home)
5. User opens Desktop folder
6. User types: "work on Testing folder"
7. LLM resolves to `~/Desktop/Testing`

**Expected:**
- Connection established in ≤3 seconds
- Sidebar shows file tree rooted at `~`
- Desktop folder opens correctly
- LLM resolves "Testing folder" to `~/Desktop/Testing`
- System message posted: "Working directory: ~/Desktop/Testing"

**Pass Criteria:**
- ✅ Connection time ≤3 seconds
- ✅ File tree rooted at Home
- ✅ Path resolution works correctly
- ✅ System message posted

### Test 2: Deny-List Enforcement

**Steps:**
1. User in active session
2. LLM attempts to read `~/.ssh/id_rsa` (denied secret)
3. LLM attempts to read `/System/Library` (denied system root, macOS)
4. Launcher blocks both attempts

**Expected:**
- First attempt: `PERMISSION_DENIED` error
- Second attempt: `PERMISSION_DENIED` error
- Error message: "Access denied: Path is blocked by policy"
- Audit log records both blocked attempts

**Pass Criteria:**
- ✅ Secrets blocked correctly
- ✅ System roots blocked correctly
- ✅ Error messages clear
- ✅ Audit log records attempts

### Test 3: Mode Enforcement and Timeout

**Steps:**
1. User starts Unrestricted session (10 min timer)
2. User performs reads (auto-approved)
3. Timer counts down: 10:00 → 9:59 → ... → 0:00
4. Session auto-ends at 0:00
5. User starts Balanced session
6. User performs reads (auto-approved)
7. User performs write (prompt shown)
8. User approves write
9. Write executes

**Expected:**
- Unrestricted timer visible and counts down
- Reads auto-approved in Unrestricted
- Session ends automatically at timeout
- Balanced reads auto-approved
- Balanced writes require prompt
- Approval works correctly

**Pass Criteria:**
- ✅ Timer visible and accurate
- ✅ Unrestricted timeout works
- ✅ Balanced reads auto-approved
- ✅ Balanced writes require prompt
- ✅ Approval flow works

### Test 4: Logout Session Termination

**Steps:**
1. User in active session
2. User has active tool call (long-running read)
3. User logs out of Clerk session
4. Backend detects logout
5. Backend sends revocation signal to launcher
6. Launcher terminates session

**Expected:**
- Logout detected within 1 second
- Revocation signal sent to launcher
- Launcher terminates MCP server
- Launcher kills all child processes
- Session ended within 2 seconds of logout
- Sidebar returns to disconnected state

**Pass Criteria:**
- ✅ Logout detected quickly
- ✅ Session terminated within 2 seconds
- ✅ Child processes killed
- ✅ UI updates correctly

---

## Implementation Timeline

**Estimated Total Duration:** 12-18 weeks

**Phase Breakdown:**
- Phase 0: 2-3 weeks
- Phase 1: 1-2 weeks
- Phase 2: 2-3 weeks
- Phase 3: 2-3 weeks
- Phase 4: 2-3 weeks
- Phase 5: 2-3 weeks
- Phase 6: 2-3 weeks
- Phase 7: 1-2 weeks

**Dependencies:**
- Phase 0 must complete before Phase 1
- Phase 1 must complete before Phase 2
- Phase 2 must complete before Phase 3
- Phase 3 must complete before Phase 4
- Phase 4 must complete before Phase 5
- Phase 5 must complete before Phase 6
- Phase 6 can run in parallel with Phase 7

**Critical Path:**
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

---

## Risk Mitigation

**High-Risk Areas:**
1. Code signing certificate expiration
2. Update feed downtime
3. Protocol handler conflicts
4. HMAC transport vulnerabilities
5. MCP server crashes
6. Rollback failures

**Mitigation Strategies:**
- Certificate renewal process documented and automated
- Update feed redundancy and monitoring
- Protocol scheme collision testing
- Security audit of HMAC implementation
- Comprehensive crash recovery
- Rollback testing in staging environment

---

**End of Implementation Plan**

This plan provides a structured roadmap for implementing the Local Environment connector. Each phase builds on the previous, with clear acceptance criteria and smoke tests to validate functionality.

