# MCP Duplicate Start Fix

## Issue

The web application was trying to connect to the MCP server a second time when using a tool command, even when a session was already active. This caused errors and conflicts.

## Root Cause

The `/api/mcp/start` route only checked the database for ACTIVE sessions, but didn't verify if a process was actually running in memory. This created a race condition where:

1. Tool call is made → checks for session → finds ACTIVE session
2. Process health check fails temporarily (e.g., during heavy load)
3. Session status gets updated to ENDED in database
4. Another request (or retry) sees no ACTIVE session
5. Tries to start a new session
6. But the original process might still be running → conflict!

## The Problem Flow

```
User makes tool call
  ↓
/api/mcp/call checks session → finds ACTIVE
  ↓
getProcessForSession() → process health check fails (temporary)
  ↓
Session marked as ENDED in database
  ↓
Frontend polling detects no session
  ↓
Something triggers /api/mcp/start
  ↓
Checks database → no ACTIVE session found
  ↓
Tries to start new process
  ↓
BUT original process might still exist → DUPLICATE START ERROR
```

## Fix Applied

### Enhanced Session Check in `/api/mcp/start`

**Before:**
- Only checked database for ACTIVE sessions
- If no ACTIVE session found, would start new process
- Didn't verify if process actually exists

**After:**
- Checks database for ACTIVE sessions
- **ALSO checks in-memory process map** using `getProcessForSession()`
- If process exists and is healthy → returns 409 (already running)
- If database says ACTIVE but process is dead → cleans up stale session first
- Only starts new process if truly no active process exists

### Code Changes

```typescript
// Check for existing MCP server session for this user
// Check both database AND in-memory process map to avoid duplicate starts
const existingSession = await prisma.localSession.findFirst({
  where: { userId, status: "ACTIVE" },
  orderBy: { startedAt: "desc" },
});

if (existingSession) {
  // Also verify if process actually exists and is healthy
  const existingProcess = await getProcessForSession(existingSession.id);
  
  if (existingProcess && !existingProcess.killed && existingProcess.pid) {
    // Process exists and is running - don't start a new one
    return NextResponse.json(
      { error: "MCP server already running", sessionId, processId },
      { status: 409 }
    );
  } else {
    // Database says ACTIVE but process is dead - clean up stale session
    await prisma.localSession.update({
      where: { id: existingSession.id },
      data: { status: "ENDED", endedAt: new Date() },
    });
    // Continue to start new session
  }
}
```

## Benefits

1. **Prevents duplicate starts**: Checks both database and process map
2. **Handles stale sessions**: Automatically cleans up dead processes
3. **Better error messages**: Returns session ID and process ID when duplicate detected
4. **More reliable**: Handles race conditions and temporary failures

## Testing

To verify the fix works:

1. **Start a session** → Should succeed
2. **Try to start again** → Should return 409 with "already running" message
3. **Kill the process manually** → Next start should clean up stale session and start new one
4. **Make tool calls rapidly** → Should not trigger duplicate starts

## Debugging

Check server logs for:
- `[MCP Start] Session X already has active process Y` - duplicate prevented
- `[MCP Start] Found stale session X, cleaning up...` - stale session cleanup
- `[MCP Start] Cleaned up stale session X` - cleanup successful

## Related Files

- `app/api/mcp/start/route.ts` - Enhanced session check
- `app/api/mcp/call/route.ts` - Process health checking
- `contexts/filesystem-context.tsx` - Frontend session polling

