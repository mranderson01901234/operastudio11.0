# End-to-End Testing Guide

**Phase 3: Transport + Pairing**  
**Status:** Ready for Testing

---

## Overview

This guide covers end-to-end testing of the pairing flow and HMAC transport implementation. The flow tests the complete path from web app pairing to launcher activation to session management.

---

## Prerequisites

1. **Backend Running**
   ```bash
   npm run dev
   # Backend should be running on http://localhost:3000
   ```

2. **Database Running**
   ```bash
   docker-compose up -d
   # PostgreSQL should be running
   ```

3. **Launcher Built**
   ```bash
   cd launcher
   npm run dev
   # Launcher should be running and ready
   ```

4. **Clerk Authentication**
   - You need to be signed in to the web app
   - Get your Clerk session token (check browser DevTools → Application → Cookies → `__session`)

---

## Test Flow Overview

```
┌─────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  Web    │─────▶│  Pair    │─────▶│ Protocol │─────▶│ Launcher │
│  App    │      │ Endpoint │      │   URL    │      │ Activate │
└─────────┘      └──────────┘      └──────────┘      └──────────┘
                                                              │
                                                              ▼
┌─────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Session │◀─────│ Heartbeat│◀─────│  Start   │◀─────│ Session  │
│  Stop   │      │  (30s)   │      │ Session  │      │ Secret   │
└─────────┘      └──────────┘      └──────────┘      └──────────┘
```

---

## Test 1: Happy Path (Complete Flow)

### Step 1: Web App Calls Pair Endpoint

**Endpoint:** `POST /api/devices/pair`  
**Auth:** Clerk session required

**Request:**
```bash
curl -X POST http://localhost:3000/api/devices/pair \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=YOUR_CLERK_SESSION_TOKEN" \
  -d '{
    "deviceMetadata": {
      "os": "linux",
      "arch": "amd64",
      "hostname": "test-device",
      "launcherVersion": "0.1.0"
    }
  }'
```

**Expected Response:**
```json
{
  "deviceId": "uuid-here",
  "deviceToken": "one-time-token-base64url",
  "pairNonce": "nonce-base64url",
  "expiresAt": 1234567890123
}
```

**Save these values:**
- `deviceId`
- `deviceToken`
- `pairNonce`
- `expiresAt`

### Step 2: Construct Protocol URL

**Format:**
```
operastudio://connect?device_id={deviceId}&device_token={deviceToken}&pair_nonce={pairNonce}&user_id={userId}&origin={origin}&expires={expiresAt}
```

**Example:**
```bash
# Replace with actual values from Step 1
DEVICE_ID="uuid-from-step-1"
DEVICE_TOKEN="token-from-step-1"
PAIR_NONCE="nonce-from-step-1"
USER_ID="user_xxx"  # Your Clerk user ID
ORIGIN="https://app.operastudio.com"
EXPIRES="1234567890123"

PROTOCOL_URL="operastudio://connect?device_id=${DEVICE_ID}&device_token=${DEVICE_TOKEN}&pair_nonce=${PAIR_NONCE}&user_id=${USER_ID}&origin=${ORIGIN}&expires=${EXPIRES}"

echo $PROTOCOL_URL
```

### Step 3: Open Protocol URL (Launcher Activation)

**Linux:**
```bash
xdg-open "$PROTOCOL_URL"
```

**macOS:**
```bash
open "$PROTOCOL_URL"
```

**Windows:**
```bash
start "$PROTOCOL_URL"
```

**Expected Behavior:**
- Launcher window opens/focuses
- Launcher validates protocol params
- Launcher generates Ed25519 keypair
- Launcher signs `pairNonce`
- Launcher calls `/api/devices/activate`
- Device status changes from `PENDING` → `ACTIVE`
- Launcher receives `sessionBootstrap`
- Launcher stores `sessionBootstrap` encrypted

**Check Launcher Console:**
- Should see: "Device activated successfully: {deviceId}"
- Should see: "Session initialization started"

### Step 4: Select Mode and Start Session

**In Launcher UI:**
1. Select a mode (Safe/Balanced/Unrestricted)
2. If Unrestricted, set duration (10-30 minutes)
3. Click "Start Session"

**Expected Behavior:**
- Launcher derives session secret from `sessionBootstrap` via HKDF
- Launcher calls `/api/sessions/start` with:
  - `deviceId`
  - `sessionSecret` (derived)
  - `mcpPort`
  - `origin`
  - `mode`
- Backend creates session
- Backend returns HMAC token
- Launcher starts heartbeat (every 30s)

**Check Backend Logs:**
- Should see session created in database
- Should see HMAC token generated

**Check Launcher Console:**
- Should see: "Session started with backend: {sessionId}"

### Step 5: Verify Heartbeat

**Wait 30 seconds** after session start.

**Expected Behavior:**
- Launcher sends heartbeat to `/api/sessions/heartbeat`
- Heartbeat includes HMAC token
- Backend verifies HMAC token (signature, TTL, origin, replay)
- Backend returns `{status: "active"}`

**Check Backend Logs:**
- Should see heartbeat requests every 30s
- Should see token verification logs

**Check Database:**
```sql
SELECT * FROM local_sessions WHERE id = '{sessionId}';
SELECT * FROM devices WHERE id = '{deviceId}';
-- lastSeenAt should update every heartbeat
```

### Step 6: Stop Session

**In Launcher UI:**
- Click "Stop Session"

**Expected Behavior:**
- Launcher calls `/api/sessions/stop` with HMAC token
- Backend verifies token
- Backend generates receipt
- Backend updates session status to `ENDED`
- Launcher stops heartbeat
- Launcher cleans up child processes

**Check Backend Logs:**
- Should see session stopped
- Should see receipt generated

---

## Test 2: Negative Cases

### Test 2.1: Expired Device Token

**Steps:**
1. Call `/api/devices/pair` and get `deviceToken` and `expiresAt`
2. Wait until `expiresAt` has passed (or manually set `expires` to past timestamp)
3. Open protocol URL with expired `expires` value

**Expected:**
- Launcher should reject: "Device token expired"
- Protocol handler should show error in UI

### Test 2.2: Wrong Origin

**Steps:**
1. Complete pairing flow with `origin=https://app.operastudio.com`
2. Modify launcher to send heartbeat with different origin
3. Or manually call `/api/sessions/heartbeat` with wrong origin

**Expected:**
- Backend should reject: "Origin mismatch"
- Token verification should fail

### Test 2.3: Replayed Nonce

**Steps:**
1. Complete session start (nonce is recorded)
2. Replay the same HMAC token within 10 seconds

**Expected:**
- Backend should reject: "Token replayed"
- Replay protection should work

### Test 2.4: Expired HMAC Token

**Steps:**
1. Start a session (token has 60s TTL)
2. Wait 61 seconds
3. Send heartbeat with expired token

**Expected:**
- Backend should reject: "Token expired"
- Token TTL validation should work

### Test 2.5: Revoked Device

**Steps:**
1. Complete pairing and start session
2. Revoke device via `/api/devices/revoke`
3. Send heartbeat

**Expected:**
- Backend should return: `{status: "revoked"}`
- Launcher should stop session within 5 seconds
- Heartbeat should stop

### Test 2.6: Loopback Bind Enforcement

**Steps:**
1. Try to call `/api/sessions/start` from non-localhost IP
2. Use curl with `--interface` or proxy

**Expected:**
- Backend should reject: "Requests must come from localhost"
- Loopback bind enforcement should work

---

## Test 3: Manual Testing Script

Create a test script to automate the happy path:

**File:** `scripts/test-e2e.sh`

```bash
#!/bin/bash

# E2E Test Script for Pairing Flow
# Requires: Backend running, Database running, Clerk session token

set -e

BACKEND_URL="http://localhost:3000"
CLERK_SESSION="YOUR_SESSION_TOKEN"  # Replace with actual token
USER_ID="user_xxx"  # Replace with your Clerk user ID
ORIGIN="https://app.operastudio.com"

echo "=== Step 1: Pair Device ==="
PAIR_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/devices/pair" \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=${CLERK_SESSION}" \
  -d '{
    "deviceMetadata": {
      "os": "linux",
      "arch": "amd64",
      "hostname": "test-device",
      "launcherVersion": "0.1.0"
    }
  }')

echo "Pair Response: ${PAIR_RESPONSE}"

DEVICE_ID=$(echo $PAIR_RESPONSE | jq -r '.deviceId')
DEVICE_TOKEN=$(echo $PAIR_RESPONSE | jq -r '.deviceToken')
PAIR_NONCE=$(echo $PAIR_RESPONSE | jq -r '.pairNonce')
EXPIRES=$(echo $PAIR_RESPONSE | jq -r '.expiresAt')

echo "Device ID: ${DEVICE_ID}"
echo "Device Token: ${DEVICE_TOKEN}"
echo "Pair Nonce: ${PAIR_NONCE}"

echo ""
echo "=== Step 2: Construct Protocol URL ==="
PROTOCOL_URL="operastudio://connect?device_id=${DEVICE_ID}&device_token=${DEVICE_TOKEN}&pair_nonce=${PAIR_NONCE}&user_id=${USER_ID}&origin=${ORIGIN}&expires=${EXPIRES}"
echo "Protocol URL: ${PROTOCOL_URL}"

echo ""
echo "=== Step 3: Open Protocol URL (manual) ==="
echo "Run this command manually:"
echo "xdg-open '${PROTOCOL_URL}'"
echo ""
echo "Then in the launcher:"
echo "1. Select a mode"
echo "2. Click 'Start Session'"
echo "3. Wait for heartbeat (30s)"
echo "4. Click 'Stop Session'"

echo ""
echo "=== Step 4: Verify Device Activated ==="
sleep 5
curl -s "${BACKEND_URL}/api/devices/${DEVICE_ID}" || echo "Device endpoint not implemented"

echo ""
echo "=== Test Complete ==="
```

---

## Test 4: API Endpoint Testing

### Test Pair Endpoint (Web-Only)

```bash
# Should succeed with Clerk auth
curl -X POST http://localhost:3000/api/devices/pair \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=VALID_TOKEN" \
  -d '{"deviceMetadata": {...}}'

# Should fail without Clerk auth
curl -X POST http://localhost:3000/api/devices/pair \
  -H "Content-Type: application/json" \
  -d '{"deviceMetadata": {...}}'
# Expected: 401 Unauthorized
```

### Test Activate Endpoint (Launcher-Only)

```bash
# Should succeed with valid deviceToken and signature
curl -X POST http://localhost:3000/api/devices/activate \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "...",
    "deviceToken": "...",
    "publicKey": "...",
    "signature": "...",
    "origin": "https://app.operastudio.com"
  }'

# Should fail without deviceToken
curl -X POST http://localhost:3000/api/devices/activate \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "..."}'
# Expected: 400 Bad Request
```

### Test Session Start (HMAC Token)

```bash
# Should succeed with valid HMAC token
curl -X POST http://localhost:3000/api/sessions/start \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "...",
    "sessionSecret": "...",
    "mcpPort": 50000,
    "origin": "https://app.operastudio.com",
    "mode": "SAFE"
  }'

# Should fail with wrong origin
curl -X POST http://localhost:3000/api/sessions/start \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "...",
    "sessionSecret": "...",
    "mcpPort": 50000,
    "origin": "https://evil.com"
  }'
# Expected: 403 Forbidden (origin mismatch)
```

---

## Verification Checklist

### Pairing Flow
- [ ] `/api/devices/pair` only accepts Clerk auth (web-only)
- [ ] `/api/devices/activate` accepts one-time deviceToken (launcher-only)
- [ ] Protocol URL parsing works correctly
- [ ] Ed25519 signature verification works
- [ ] Device status changes PENDING → ACTIVE
- [ ] `sessionBootstrap` is returned and stored

### HMAC Transport
- [ ] HMAC tokens have correct claims structure
- [ ] Token TTL is 60 seconds
- [ ] Replay window is 10 seconds
- [ ] Clock skew tolerance is ±30 seconds
- [ ] Origin pinning enforced on all requests
- [ ] Loopback bind enforced (127.0.0.1 only)

### Session Management
- [ ] Session start creates HMAC token
- [ ] Heartbeat verifies HMAC token
- [ ] Heartbeat stops within 5s of revocation
- [ ] Session stop verifies HMAC token
- [ ] Session receipt generated correctly

### Negative Cases
- [ ] Expired device token rejected
- [ ] Wrong origin rejected
- [ ] Replayed nonce rejected
- [ ] Expired HMAC token rejected
- [ ] Revoked device stops heartbeat
- [ ] Non-localhost requests rejected

---

## Debugging Tips

### Check Launcher Logs
```bash
# Launcher console shows:
# - Protocol URL received
# - Device activation status
# - Session start/stop
# - Heartbeat status
```

### Check Backend Logs
```bash
# Backend console shows:
# - Pair/activate requests
# - Session start/stop/heartbeat
# - Token verification results
# - Errors
```

### Check Database
```sql
-- Check devices
SELECT * FROM devices ORDER BY created_at DESC LIMIT 5;

-- Check sessions
SELECT * FROM local_sessions ORDER BY started_at DESC LIMIT 5;

-- Check device keys
SELECT * FROM device_keys ORDER BY created_at DESC LIMIT 5;
```

### Common Issues

1. **"Device token expired"**
   - Check `expiresAt` timestamp
   - Ensure system clock is correct

2. **"Origin mismatch"**
   - Verify `origin` matches exactly
   - Check protocol URL construction

3. **"Token replayed"**
   - Wait 10+ seconds between requests
   - Check nonce cache

4. **"Requests must come from localhost"**
   - Verify request comes from 127.0.0.1
   - Check proxy/forwarding headers

---

## Next Steps After Testing

Once E2E tests pass:

1. **Document any issues found**
2. **Fix bugs discovered**
3. **Add automated tests** (if needed)
4. **Proceed to Phase 4** (MCP Façade)

---

**Status:** Ready for Testing  
**Last Updated:** 2025-01-27

