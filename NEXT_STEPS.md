# Next Steps: Phase 3 - Transport + Pairing

**Current Status:** Phase 2 Complete ✅  
**Next Phase:** Phase 3 - Transport + Pairing

---

## What's Done

✅ **Phase 1:** Backend Scaffolding
- Database schema (devices, sessions, tool_runs)
- API endpoints for pairing, sessions, heartbeat
- TypeScript types and utilities

✅ **Phase 2:** Launcher MVP
- Electron launcher with protocol handler
- Localhost server with health endpoint
- Consent UI with mode selection
- Session management UI

---

## Phase 3: Transport + Pairing

**Goal:** Connect launcher to backend API and implement secure device pairing.

### Priority Tasks

#### 1. Backend API Integration (High Priority)

**Connect launcher to Phase 1 endpoints:**

- [ ] **Device Pairing Flow**
  - Implement `POST /api/devices/pair` call from launcher
  - Generate Ed25519 keypair in launcher
  - Compute PKCE proof
  - Store device token securely (OS keychain)

- [ ] **Session Start Flow**
  - Implement `POST /api/sessions/start` call
  - Exchange session secret with backend
  - Store session token
  - Send mode selection to backend

- [ ] **Session Heartbeat**
  - Implement `POST /api/sessions/heartbeat` (every 30s)
  - Handle revocation signals
  - Update last_seen_at

- [ ] **Session Stop Flow**
  - Implement `POST /api/sessions/stop` call
  - Generate receipt
  - Clean up session

#### 2. HMAC Transport Implementation

- [ ] **Token Format**
  - Implement HMAC-SHA256 signing
  - Create token claims structure
  - Add TTL validation (60s)
  - Implement replay window (10s)
  - Add clock skew tolerance (±30s)

- [ ] **Secret Exchange**
  - Generate 32-byte session secret
  - Encrypt secret for storage
  - Exchange with backend via HTTPS
  - Store per session

- [ ] **Origin Pinning**
  - Extract origin from protocol URL
  - Include in token claims
  - Verify on every request
  - Reject origin mismatches

#### 3. Device Pairing Implementation

- [ ] **PKCE-Style Proof**
  - Generate Ed25519 keypair
  - Compute proof: `HMAC-SHA256(nonce + devicePublicKey, devicePrivateKey)`
  - Send to backend
  - Receive device token

- [ ] **Key Storage**
  - Encrypt device private key (OS keychain)
  - Store device token (encrypted)
  - Store device ID (plaintext)

- [ ] **Revocation Handling**
  - Listen for revocation signals
  - Terminate MCP server on revocation
  - Clear device token locally
  - Shut down gracefully

#### 4. Crypto Utilities

- [ ] **Ed25519 Keypair Generation**
  - Use Node.js crypto module
  - Generate keypair
  - Export public/private keys

- [ ] **HMAC Operations**
  - Implement signing
  - Implement verification
  - Add timing-safe comparison

- [ ] **OS Keychain Integration**
  - macOS: Use `keytar` or `node-keytar`
  - Linux: Use `libsecret` or `keyring`
  - Windows: Use Windows Credential Store

---

## Implementation Order

### Week 1: Backend Integration

1. **Day 1-2: HTTP Client Setup**
   - Install HTTP client (axios or fetch)
   - Create API client module
   - Add error handling
   - Add retry logic

2. **Day 3-4: Device Pairing**
   - Implement Ed25519 keypair generation
   - Implement PKCE proof
   - Call `/api/devices/pair`
   - Store device token

3. **Day 5: Session Management**
   - Implement session start
   - Implement heartbeat
   - Implement session stop

### Week 2: HMAC Transport

1. **Day 1-2: HMAC Implementation**
   - Token signing/verification
   - TTL validation
   - Replay protection
   - Clock skew handling

2. **Day 3: Secret Exchange**
   - Generate session secrets
   - Exchange with backend
   - Store securely

3. **Day 4-5: Origin Pinning**
   - Extract origin from URL
   - Include in tokens
   - Verify on requests

### Week 3: Key Storage & Revocation

1. **Day 1-2: OS Keychain**
   - Install keychain library
   - Implement storage/retrieval
   - Test on all platforms

2. **Day 3-4: Revocation**
   - Handle revocation signals
   - Clean up on revocation
   - Test revocation flow

---

## Quick Start: Backend Integration

### Step 1: Install Dependencies

```bash
cd launcher
npm install axios
npm install --save-dev @types/node-keytar  # For keychain (optional)
```

### Step 2: Create API Client

Create `launcher/src/main/api-client.ts`:

```typescript
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';

export class APIClient {
  async pairDevice(nonce: string, devicePublicKey: string, proof: string, metadata: DeviceMetadata) {
    // Call POST /api/devices/pair
  }

  async startSession(deviceToken: string, sessionSecret: string, mcpPort: number, mode?: string) {
    // Call POST /api/sessions/start
  }

  async heartbeat(sessionId: string, sessionToken: string) {
    // Call POST /api/sessions/heartbeat
  }

  async stopSession(sessionId: string, sessionToken: string) {
    // Call POST /api/sessions/stop
  }
}
```

### Step 3: Integrate with Session Manager

Update `session-manager.ts` to:
- Call API endpoints
- Store tokens securely
- Handle errors
- Implement retry logic

---

## Testing Checklist

- [ ] Device pairing works end-to-end
- [ ] Session starts successfully
- [ ] Heartbeat updates backend
- [ ] Session stops and generates receipt
- [ ] Revocation terminates session
- [ ] HMAC tokens validate correctly
- [ ] Origin pinning prevents cross-origin attacks
- [ ] Keys stored securely in OS keychain

---

## Dependencies Needed

```json
{
  "dependencies": {
    "axios": "^1.6.0",           // HTTP client
    "keytar": "^7.9.0"           // OS keychain (optional)
  }
}
```

---

**Ready to start Phase 3?** Let me know and I'll begin implementing the backend integration!

