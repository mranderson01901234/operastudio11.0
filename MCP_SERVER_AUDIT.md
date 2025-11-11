# MCP Server Availability Audit

## Issues Found

### 1. **Critical: In-Memory Process Map Lost on Server Restart**
**Location:** `app/api/mcp/call/route.ts`
- `activeProcesses` Map is stored in memory
- When Next.js server restarts (dev mode), the map is cleared
- Database session remains `ACTIVE` but process is gone
- **Result:** 503 "MCP server process not available" errors

### 2. **Process Exit Doesn't Update Database**
**Location:** `app/api/mcp/call/route.ts` - `registerMCPProcess()`
- When process exits, it's removed from map
- Database session status is NOT updated to `ENDED`
- **Result:** Stale sessions in database

### 3. **No Process Health Verification**
**Location:** `app/api/mcp/call/route.ts` - `getProcessForSession()`
- Only checks `mcpProcess.killed`
- Doesn't verify process is actually alive
- Process can be "not killed" but still dead/crashed
- **Result:** Attempts to use dead processes

### 4. **Missing Process Start Error Handling**
**Location:** `app/api/mcp/start/route.ts`
- Process spawn errors are logged but not handled
- If process crashes immediately, session is still created
- **Result:** Orphaned sessions

### 5. **No Process PID Verification**
**Location:** `app/api/mcp/call/route.ts`
- Process PID is stored but not used to verify process exists
- Can't check if process with that PID is still running
- **Result:** Can't detect process death

### 6. **Missing Process Cleanup on Stop**
**Location:** `app/api/mcp/stop/route.ts`
- TODO comment: "Kill the MCP server process"
- Process is not actually killed when session stops
- **Result:** Processes continue running after "stop"

## Root Cause Analysis

The primary issue is **process lifecycle management**:

1. Process is spawned and registered in memory
2. If server restarts → process map is lost
3. Database still shows session as ACTIVE
4. Tool calls fail because process doesn't exist in map
5. No mechanism to detect or recover from this state

## Recommended Fixes

1. **Add Process Health Check**
   - Verify process is alive before use
   - Check process PID exists
   - Handle process death gracefully

2. **Update Database on Process Exit**
   - When process exits, update session status to ENDED
   - Clean up stale sessions

3. **Add Process Recovery**
   - Detect stale sessions (ACTIVE but no process)
   - Auto-mark as ENDED or attempt restart

4. **Improve Process Tracking**
   - Store process PID in database
   - Verify PID on tool calls
   - Handle process death detection

5. **Add Process Cleanup**
   - Actually kill process on stop
   - Clean up on server shutdown

