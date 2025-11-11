# File System Process Bug Audit

## User Flow Analysis

### Expected Flow
1. ✅ User signs in
2. ✅ User clicks "File System" button from sidebar
3. ✅ Select Security Mode UI appears
4. ✅ User clicks "Start Session"
5. ✅ File tree shows in sidebar
6. ❌ **BUG**: User prompts LLM to edit a file in editor view
   - LLM understands which file is referenced ✅
   - LLM rewrites the file but only in chat, not in actual editor ❌
   - Then errors saying MCP server is unavailable ❌
   - Then opens Select Security Mode UI again ❌

## Bugs Identified

### Bug 1: File Edits Not Updating Editor
**Location**: `components/chat/chat-interface.tsx` (lines 366-379)

**Problem**: 
- When `fs_write` tool call succeeds, the code checks if file is open using `fileEditorState.openFiles.has(filePath)`
- If file is open, it calls `updateFileContent(filePath, content)`
- However, file paths might not match exactly (e.g., `~/file.txt` vs `/home/user/file.txt`)
- Also, when file is not open, `openFile` is called with `void`, meaning it's not awaited and content update might happen before file is actually opened

**Root Cause**:
- Path normalization issues (relative vs absolute, `~` expansion)
- Async state update timing issues
- File path matching logic too strict

**Fix Applied**:
- Added path matching logic that checks:
  1. Exact path match
  2. Filename match (handles path variations)
  3. Path containment (handles relative/absolute mismatches)
- When file is not open, properly await `openFile` and then update content
- Added retry logic with delay to handle async state updates

### Bug 2: MCP Server Unavailable Error
**Location**: `app/api/mcp/call/route.ts` (lines 148-170)

**Problem**:
- When MCP process dies or becomes unavailable, `getProcessForSession` returns `null`
- API returns 503 error with message "MCP server process not available"
- Frontend error handler shows error message but doesn't handle session state properly
- Error message suggests reconnecting but doesn't prevent mode selector from auto-showing

**Root Cause**:
- Process health check detects dead process and cleans up session in database
- Frontend polling detects session ended and triggers mode selector
- No distinction between "user wants to connect" vs "session died"

**Fix Applied**:
- Updated error message to be clearer about what happened
- Removed automatic mode selector trigger when session dies
- Error is shown in chat, but user must explicitly select File System tool again to reconnect

### Bug 3: Select Security Mode UI Auto-Opening
**Location**: `contexts/filesystem-context.tsx` (lines 235-268, 270-338)

**Problem**:
- Polling mechanism checks session status every 2-10 seconds
- When session dies, it sets status to "disconnected"
- useEffect that checks for active session sees "disconnected" and automatically sets status to "selecting-mode"
- This causes the mode selector to appear even when user didn't request it

**Root Cause**:
- useEffect has `sessionStatus` in dependencies, causing it to re-run when status changes
- Logic doesn't distinguish between "user selecting filesystem tool" vs "session died while viewing filesystem"
- No guard to prevent auto-showing selector when session dies

**Fix Applied**:
- Removed `sessionStatus` from useEffect dependencies to prevent re-triggering on status changes
- Updated polling logic to only change status from "connected" to "disconnected" when session dies
- Added comments explaining that mode selector should only show when user explicitly selects filesystem tool
- Session death now sets status to "disconnected" but doesn't auto-show mode selector

## Code Changes Summary

### 1. `components/chat/chat-interface.tsx`
- Enhanced file path matching logic to handle path variations
- Fixed async file opening and content update flow
- Improved error messages for MCP unavailable errors
- Added retry logic for file content updates

### 2. `contexts/filesystem-context.tsx`
- Removed `sessionStatus` from useEffect dependencies to prevent auto-triggering
- Updated session polling to not auto-show mode selector on session death
- Added comments explaining the intended behavior

## Testing Recommendations

1. **File Edit Test**:
   - Open a file in editor
   - Ask LLM to edit it
   - Verify file updates in editor (not just chat)
   - Try with files using `~` paths
   - Try with files not yet open in editor

2. **MCP Server Death Test**:
   - Start a session
   - Kill the MCP server process manually
   - Try to use a file system tool
   - Verify error message appears in chat
   - Verify mode selector does NOT auto-appear
   - Verify user can manually reconnect by selecting File System tool

3. **Session Polling Test**:
   - Start a session
   - Let it die naturally (or kill process)
   - Verify status changes to "disconnected"
   - Verify mode selector does NOT appear automatically
   - Verify user can manually reconnect

## Additional Notes

- The file path matching logic uses filename matching as a fallback, which might have edge cases with duplicate filenames in different directories
- Consider adding a more robust path normalization utility function
- Consider adding telemetry/logging to track when files fail to update in editor
- The retry logic uses a 200ms delay - might need tuning based on actual performance

