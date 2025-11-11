# MCP 503 Error Debugging Guide

## Current Issue

When the LLM tries to call `fs_write`, it gets a 503 (Service Unavailable) error. The process starts successfully but becomes unavailable when tool calls are made.

## What We've Fixed

1. **Enhanced Logging**: Added comprehensive logging throughout the MCP call flow
2. **Process Health Checks**: Improved health verification with detailed logging
3. **Stderr Capture**: Now capturing stderr from MCP server to see errors
4. **Process Exit Monitoring**: Detecting when process crashes during requests
5. **LLM Instructions**: Strengthened instructions to call `fs_write` FIRST, not output content

## What to Check - Server Logs

**IMPORTANT**: Check your **server terminal** (where Next.js is running), NOT the browser console!

When you make a tool call and get 503, look for these log messages:

### Process Registration
- `[registerMCPProcess] Registering process X for session Y` - Process was registered
- `[registerMCPProcess] Registered. Active processes: ...` - Shows all active sessions

### Process Lookup
- `[MCP Call] Found session X for user Y, getting process...` - Session found in database
- `[getProcessForSession] Found entry for session X, PID: Y, checking health...` - Process found in map
- `[getProcessForSession] No entry found in activeProcesses` - Process NOT in map (problem!)

### Health Check Results
- `[Process Health] Process X is healthy` - ✅ Process is OK
- `[Process Health] Process X is marked as killed` - ❌ Process was killed
- `[Process Health] Process X PID check failed` - ❌ Process doesn't exist
- `[Process Health] Process X stdin not available` - ❌ Can't send requests
- `[Process Health] Process X stdout not available` - ❌ Can't receive responses

### MCP Server Errors
- `[MCP Server stderr]` - Errors from the MCP server itself
- `[MCP Call] stderr for request X:` - Errors during tool calls
- `[MCP Call] Process exited during request` - Process crashed during operation

## Common Issues & Solutions

### Issue 1: Process Not in Map
**Symptoms**: `[getProcessForSession] No entry found in activeProcesses`
**Causes**:
- Process died immediately after registration
- Process was cleaned up incorrectly
- Session ID mismatch

**Check**: Look for `[registerMCPProcess]` logs when session starts

### Issue 2: Process Died
**Symptoms**: `[Process Health] Process X PID check failed` or `Process exited`
**Causes**:
- MCP server crashed (check stderr)
- Process was killed externally
- Resource exhaustion

**Check**: Look for `[MCP Server stderr]` logs showing errors

### Issue 3: Streams Destroyed
**Symptoms**: `stdin not available` or `stdout not available`
**Causes**:
- Process crashed but PID still exists
- Streams were closed incorrectly
- Process in bad state

**Check**: Look for process exit logs

### Issue 4: LLM Outputting Content First
**Symptoms**: LLM shows file content in chat, then calls tool
**Fix Applied**: Strengthened instructions in:
- `lib/chat/tool-definitions.ts` - Tool description
- `components/chat/chat-interface.tsx` - System message

## Next Steps

1. **Check Server Logs**: Look at your Next.js server terminal when making a tool call
2. **Look for**: The log messages listed above to identify which check is failing
3. **Share Logs**: Share the server-side logs (not browser console) so we can diagnose

## Expected Log Flow (Success)

```
[MCP Start] Process 12345 started successfully in UNRESTRICTED mode
[registerMCPProcess] Registering process 12345 for session abc-123
[registerMCPProcess] Registered. Active processes: abc-123
[MCP Start] Successfully registered and verified process 12345
...
[MCP Call] Found session abc-123 for user user_xxx, getting process...
[getProcessForSession] Found entry for session abc-123, PID: 12345, checking health...
[Process Health] Process 12345 is healthy
[MCP Call] Process 12345 is available for tool call: fs_write
[MCP Call] Sent request 1234567890 for tool fs_write
[MCP Call] Tool error for fs_write: ... (if error)
```

## Expected Log Flow (Failure)

```
[MCP Call] Found session abc-123 for user user_xxx, getting process...
[getProcessForSession] Found entry for session abc-123, PID: 12345, checking health...
[Process Health] Process 12345 PID check failed - process not alive
[getProcessForSession] Process 12345 failed health check, cleaning up session abc-123
[MCP Call] Process not available for session abc-123
```

## Action Items

1. ✅ Added comprehensive logging
2. ✅ Enhanced process health checks
3. ✅ Added stderr capture
4. ✅ Strengthened LLM instructions
5. ⏳ **NEXT**: Check server logs to identify root cause

