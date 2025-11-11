# LLM Tool Calling Functionality - Comprehensive Audit Report

**Date:** 2025-01-27  
**Scope:** Complete audit of LLM tool calling system, natural language processing, file operations, directory navigation, and command execution

---

## Executive Summary

This report documents the current state of the LLM's tool calling functionality in OperaStudio. The system uses Google Gemini Flash with function calling capabilities to execute various tools including file system operations, command execution, GitHub operations, email management, and web search.

**Key Findings:**
- ✅ Tool calling infrastructure is functional
- ✅ File system tools (fs_read, fs_write, fs_list, fs_delete) work via MCP server
- ✅ Command execution (cmd_execute) works via MCP server
- ✅ Working directory management exists but has limitations
- ⚠️ File auto-opening logic may fail silently
- ⚠️ Path resolution relies heavily on LLM using find commands
- ❌ No actual testing performed - report based on code analysis only

---

## 1. System Architecture

### 1.1 LLM Provider
- **Provider:** Google Gemini Flash (`gemini-flash-latest`)
- **Client:** `lib/clients/gemini.ts`
- **Streaming:** Yes, supports streaming responses
- **Function Calling:** Yes, via `functionCall` in stream chunks

### 1.2 System Prompt
**Location:** `lib/clients/gemini.ts` lines 37-72

**Key Instructions:**
- Extremely concise responses (1-2 sentences max, under 20 words)
- No explanations of process or reasoning
- Direct action: "Done." "Found 508 items." "File created."
- Path resolution: Use `cmd_execute` with `find` command
- Grep usage: Documented for text search

**Issues:**
- Very strict brevity requirements may cause LLM to skip important context
- No explicit instruction about when to ask for clarification vs. guessing

### 1.3 Tool Loading
**Location:** `app/api/chat/route.ts` lines 397-440

**Tool Loading Logic:**
1. File system tools (`FILE_TOOLS`) - Always available when `enableTools !== false`
2. `cmd_execute` - Only if MCP session is active (`hasMCPSession`)
3. `change_directory` - Always available when `enableTools !== false`
4. Email tools - Only if email account connected (`hasEmailAccount`)
5. GitHub tools - Only if GitHub account connected (`hasGitHubAccount`)
6. Web search tools - Always available when `enableTools !== false`
7. Imagen tools - Conditional based on current image state

**Issue:** `cmd_execute` requires MCP session, but file system tools don't. This creates inconsistency.

---

## 2. Tool Definitions

### 2.1 File System Tools (`lib/chat/tool-definitions.ts`)

#### `fs_read`
- **Purpose:** Read file contents
- **Parameters:** `path` (required), `maxBytes` (optional, default 10MB)
- **Description:** Instructs LLM to search with `find` if file not found
- **Execution:** Via MCP server (`/api/mcp/call`)
- **Auto-open:** Yes, if user requested file (lines 2074-2154 in chat-interface.tsx)
- **Status:** ✅ Functional

#### `fs_write`
- **Purpose:** Write/overwrite file contents
- **Parameters:** `path` (required), `content` (required), `create` (optional)
- **Description:** Instructs LLM to use `fs_read` first if user says "edit" without changes
- **Execution:** Via MCP server (`/api/mcp/call`)
- **File Editor Integration:** Yes, updates editor state (lines 2228-2283)
- **Status:** ✅ Functional

#### `fs_list`
- **Purpose:** List directory contents
- **Parameters:** `path` (required), `depth` (optional, default 1), `includeHidden` (optional)
- **Description:** Instructs LLM to summarize large directories (100+ items)
- **Execution:** Via MCP server (`/api/mcp/call`)
- **Status:** ✅ Functional

#### `fs_delete`
- **Purpose:** Delete files or directories
- **Parameters:** `path` (required), `recursive` (optional, default false)
- **Description:** Only available in Balanced/Unrestricted security modes
- **Execution:** Via MCP server (`/api/mcp/call`)
- **Status:** ✅ Functional (security mode dependent)

### 2.2 Command Execution Tool

#### `cmd_execute`
- **Purpose:** Execute shell commands
- **Parameters:** 
  - `command` (required) - Command name
  - `args` (optional) - Array of arguments
  - `cwd` (optional) - Working directory
  - `timeout` (optional) - Timeout in milliseconds (default 30000)
  - `useSudo` (optional) - Execute with sudo
- **Description:** Very detailed, includes grep examples, find examples, download examples
- **Execution:** Via MCP server (`/api/mcp/call`)
- **Auto-retry:** Yes, automatically retries with sudo if permission denied
- **Status:** ✅ Functional (requires MCP session)

### 2.3 Working Directory Tool

#### `change_directory`
- **Purpose:** Change persistent working directory
- **Parameters:** `path` (required) - MUST be absolute path
- **Description:** Instructs LLM to search with `find` if given just a name
- **Execution:** Client-side only (lines 1973-1993 in chat-interface.tsx)
- **Storage:** Persisted to localStorage (`operastudio_working_directory`)
- **Context Integration:** Injected into system messages (lines 2825-2832)
- **Status:** ✅ Functional but has limitations (see section 4.2)

---

## 3. Tool Calling Flow

### 3.1 Stream Processing
**Location:** `components/chat/chat-interface.tsx` lines 1802-1814

**Flow:**
1. User sends message → `sendMessage()` function
2. Message sent to `/api/chat` endpoint
3. Response streamed back via Server-Sent Events (SSE)
4. `handleStreamWithFunctionCalls()` processes stream chunks
5. Function calls detected in stream chunks (`type: "function_call"`)
6. Tool calls executed sequentially
7. Results sent back to LLM via recursive follow-up request
8. Maximum recursion depth: 10 (line 1811)

**Recursion Prevention:**
- Depth counter increments on each recursive call
- Warning logged if depth > 10
- Function returns early if limit reached

### 3.2 Tool Execution Routing
**Location:** `lib/chat/tool-handler.ts` lines 600-800 (approximate)

**Routing Logic:**
```typescript
if (toolCall.name.startsWith("email_")) → executeEmailToolCall()
else if (toolCall.name.startsWith("github_")) → executeGitHubToolCall()
else if (toolCall.name.startsWith("imagen_")) → executeImagenToolCall()
else if (toolCall.name === "change_directory") → Client-side handler
else → executeMCPToolCall() // For fs_* and cmd_execute
```

**MCP Tool Execution:**
- POST to `/api/mcp/call`
- Body: `{ tool: string, arguments: Record<string, unknown> }`
- Response: Tool result or error
- Timeout: 60 seconds

### 3.3 Follow-up Requests
**Location:** `components/chat/chat-interface.tsx` lines 2538-2595

**After Tool Execution:**
1. Tool result formatted for LLM
2. Follow-up payload built with:
   - Previous messages
   - Current user message
   - Assistant message content
   - Tool result as user message: `"Function {name} result: {result}"`
   - Minimal system context (tool capabilities only)
3. New request sent to `/api/chat`
4. Stream processed recursively with `depth + 1`

**Issue:** File context is skipped in follow-ups (line 2572 comment), which may cause LLM to lose track of open files.

---

## 4. Natural Language Processing

### 4.1 Path Resolution

**Current Approach:**
- LLM is instructed to use `cmd_execute` with `find` command
- Search order: ~/Desktop, ~/Documents, ~/Downloads, ~
- Must use absolute paths in tool calls

**System Instructions:**
- `lib/clients/gemini.ts` lines 48-53: Basic path resolution
- `components/chat/chat-interface.tsx` lines 1110-1123: Detailed path resolution instructions
- `lib/chat/tool-definitions.ts` line 30: fs_read description instructs searching
- `lib/chat/tool-definitions.ts` line 154: change_directory description instructs searching

**Issues:**
- No automatic path resolution - relies entirely on LLM making find commands
- If LLM doesn't follow instructions, path resolution fails
- Working directory context exists but LLM is told NOT to assume relative paths

### 4.2 Working Directory Management

**Implementation:**
- Context: `contexts/working-directory-context.tsx`
- Default: `~` (home directory)
- Storage: localStorage key `operastudio_working_directory`
- Provider: Wraps app in `app/layout.tsx`

**System Message Injection:**
- Lines 2825-2832 in chat-interface.tsx
- Message: "When user references a directory/file by name only, DO NOT assume it's relative to this directory. Instead, search for it using cmd_execute with 'find' command."

**Issue:** The working directory is stored but the LLM is explicitly told NOT to use it for relative path resolution. This defeats the purpose of having a working directory.

### 4.3 File Opening Logic

**Location:** `components/chat/chat-interface.tsx` lines 2074-2154

**Logic:**
1. Check if `fs_read` succeeded
2. Extract user message keywords: ["find", "show", "open", "read", "display", "see", "view", "get", "can you", "edit", "modify", "change", "update", "let's"]
3. Check if filename/path mentioned in user message
4. If exact match OR user asked to edit/find/open → call `openFile(filePath)`

**Issues:**
- Complex matching logic may fail if filename doesn't exactly match user's message
- If LLM found file via `find` command, filename might not be in original user message
- Console logs added but errors may be swallowed
- No error handling if `openFile()` fails

**Test Needed:** Verify file actually opens when LLM finds it via find command.

---

## 5. File Operations

### 5.1 Reading Files

**Flow:**
1. User: "let's edit CHEATSHEET.md"
2. LLM: Calls `cmd_execute` with `find` to locate file
3. LLM: Calls `fs_read` with found absolute path
4. System: Auto-opens file if keywords match (may fail silently)
5. LLM: Responds "File opened. What changes would you like to make?"

**Status:** ⚠️ Functional but auto-open may fail

### 5.2 Writing Files

**Flow:**
1. User: "add X to file" or "change Y to Z"
2. LLM: Calls `fs_read` to get current content
3. LLM: Modifies content
4. LLM: Calls `fs_write` with modified content
5. System: Updates file editor state (lines 2228-2283)
6. File saved to disk via MCP server

**File Editor Integration:**
- Tracks edit start/complete
- Updates editor content
- Shows in file editor UI

**Status:** ✅ Functional

### 5.3 Listing Directories

**Flow:**
1. User: "list files in 3.0"
2. LLM: Calls `cmd_execute` with `find` to locate directory
3. LLM: Calls `fs_list` with found absolute path
4. LLM: Summarizes if 100+ items

**Status:** ✅ Functional

### 5.4 Deleting Files

**Flow:**
1. User: "delete file X"
2. LLM: Calls `cmd_execute` with `find` to locate file
3. LLM: Calls `fs_delete` with found absolute path
4. File deleted via MCP server

**Status:** ✅ Functional (security mode dependent)

---

## 6. Command Execution

### 6.1 Basic Commands

**Examples:**
- `git status` → `cmd_execute({ command: "git", args: ["status"] })`
- `npm install` → `cmd_execute({ command: "npm", args: ["install"] })`
- `ls -la` → `cmd_execute({ command: "ls", args: ["-la"] })`

**Status:** ✅ Functional (requires MCP session)

### 6.2 Sudo Commands

**Auto-retry Logic:**
- If command fails with permission error
- System automatically retries with `useSudo: true`
- LLM sees final result only

**Status:** ✅ Functional

### 6.3 Find Command

**Usage:**
- Find directory: `cmd_execute({ command: "find", args: ["~", "-type", "d", "-name", "3.0", "-maxdepth", "3"] })`
- Find file: `cmd_execute({ command: "find", args: ["~", "-type", "f", "-name", "CHEATSHEET.md", "-maxdepth", "5"] })`

**Status:** ✅ Functional

### 6.4 Grep Command

**Documentation:**
- System instructions include grep examples
- Tool description includes grep examples
- Recursive search: `args: ["-r", "-n", "searchterm", "/path"]`

**Status:** ✅ Functional (documented, not tested)

---

## 7. Issues and Limitations

### 7.1 Critical Issues

1. **File Auto-opening May Fail Silently**
   - Complex matching logic
   - No guarantee file opens even if LLM found it
   - Errors may be swallowed

2. **Working Directory Not Used for Relative Paths**
   - LLM explicitly told NOT to assume relative paths
   - Working directory exists but not utilized effectively
   - Defeats purpose of persistent working directory

3. **Path Resolution Relies Entirely on LLM**
   - No automatic path resolution
   - If LLM doesn't follow instructions, fails
   - No fallback mechanism

### 7.2 Limitations

1. **Recursion Depth Limit**
   - Maximum 10 recursive tool calls
   - May be insufficient for complex workflows
   - No graceful degradation

2. **File Context Skipped in Follow-ups**
   - File context not included in recursive requests
   - LLM may lose track of open files
   - May cause confusion about which file to edit

3. **No Testing Performed**
   - This report based on code analysis only
   - No actual tool execution tests
   - Unknown if tools work in practice

### 7.3 Potential Issues

1. **Tool Loading Inconsistency**
   - `cmd_execute` requires MCP session
   - File system tools don't require session
   - May cause confusion

2. **Error Handling**
   - Some errors may be swallowed
   - User may not see why operations failed
   - Console logs may not be visible to user

---

## 8. Testing Recommendations

### 8.1 Required Tests

1. **File Operations:**
   - [ ] Read file by exact path
   - [ ] Read file by name (LLM must find it)
   - [ ] Write file (new file)
   - [ ] Write file (existing file)
   - [ ] List directory by exact path
   - [ ] List directory by name (LLM must find it)
   - [ ] Delete file
   - [ ] Delete directory

2. **Path Resolution:**
   - [ ] User says "edit CHEATSHEET.md" → LLM finds and opens file
   - [ ] User says "list files in 3.0" → LLM finds directory and lists
   - [ ] User says "change directory to Desktop" → LLM finds and changes
   - [ ] Multiple matches → LLM asks for clarification

3. **Command Execution:**
   - [ ] Basic command: `ls -la`
   - [ ] Command with args: `git status`
   - [ ] Sudo command: `apt install package` (auto-retry)
   - [ ] Find command: `find ~ -name "file.txt"`
   - [ ] Grep command: `grep -r "pattern" /path`

4. **Working Directory:**
   - [ ] Change directory persists across sessions
   - [ ] Working directory shown in system messages
   - [ ] Relative paths work (if implemented)

5. **File Auto-opening:**
   - [ ] File opens when user says "edit filename"
   - [ ] File opens when LLM finds file via find command
   - [ ] File opens when user says "let's edit filename"
   - [ ] File does NOT open for generic read requests

6. **Recursion:**
   - [ ] Multiple sequential tool calls work
   - [ ] Recursion depth limit prevents infinite loops
   - [ ] Follow-up requests include correct context

### 8.2 Test Scenarios

**Scenario 1: Edit File by Name**
```
User: "let's edit CHEATSHEET.md"
Expected:
1. LLM calls cmd_execute with find
2. LLM calls fs_read with found path
3. File opens in editor
4. LLM responds "Opened CHEATSHEET.md for editing."
```

**Scenario 2: Change Directory**
```
User: "change directory to Desktop"
Expected:
1. LLM calls cmd_execute with find to locate Desktop
2. LLM calls change_directory with absolute path
3. Directory changes and persists
4. LLM responds "Changed to /home/user/Desktop"
```

**Scenario 3: List Large Directory**
```
User: "list files in 2.0"
Expected:
1. LLM calls cmd_execute with find
2. LLM calls fs_list with found path
3. If 100+ items, LLM summarizes instead of listing all
4. LLM responds "508 items found. Main dirs: apps, ingestion-service..."
```

---

## 9. Code Quality Observations

### 9.1 Strengths

1. **Comprehensive Tool Descriptions**
   - Detailed descriptions help LLM understand tool usage
   - Examples included in descriptions
   - Clear parameter documentation

2. **Error Handling**
   - Try-catch blocks around tool execution
   - Error messages formatted for LLM
   - Timeout handling

3. **File Editor Integration**
   - Tracks file edits
   - Updates editor state
   - Shows edit history

### 9.2 Weaknesses

1. **Complex Auto-open Logic**
   - Many conditions to check
   - May fail silently
   - Hard to debug

2. **Inconsistent Tool Requirements**
   - Some tools require sessions, others don't
   - May confuse LLM

3. **No Actual Testing**
   - Code exists but not tested
   - Unknown if it works in practice

---

## 10. Recommendations

### 10.1 Immediate Actions

1. **Test All Tools**
   - Run comprehensive test suite
   - Verify each tool works as expected
   - Document any failures

2. **Fix File Auto-opening**
   - Simplify logic
   - Add better error handling
   - Ensure file opens when LLM finds it

3. **Utilize Working Directory**
   - Allow LLM to use working directory for relative paths
   - Update system instructions
   - Test relative path resolution

### 10.2 Improvements

1. **Automatic Path Resolution**
   - Add server-side path resolution
   - Don't rely entirely on LLM
   - Provide fallback mechanism

2. **Better Error Messages**
   - Show errors to user
   - Don't swallow errors silently
   - Provide actionable feedback

3. **Simplify Auto-open Logic**
   - If fs_read succeeds and user asked to edit/open → always open
   - Remove complex matching logic
   - Trust LLM's intent

---

## 11. Conclusion

The LLM tool calling system is **architecturally sound** but has **implementation issues**:

- ✅ Tool infrastructure works
- ✅ Tools are well-defined
- ✅ Error handling exists
- ⚠️ File auto-opening may fail
- ⚠️ Path resolution relies too heavily on LLM
- ❌ No testing performed

**Critical Next Steps:**
1. Run comprehensive tests
2. Fix file auto-opening
3. Improve path resolution
4. Utilize working directory effectively

**Status:** System appears functional but needs testing and refinement.

---

**Report Generated:** 2025-01-27  
**Based On:** Code analysis only - no runtime testing performed  
**Files Analyzed:**
- `lib/clients/gemini.ts`
- `lib/chat/tool-definitions.ts`
- `lib/chat/tool-handler.ts`
- `components/chat/chat-interface.tsx`
- `app/api/chat/route.ts`
- `contexts/working-directory-context.tsx`

