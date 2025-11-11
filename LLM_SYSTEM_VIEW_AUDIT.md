# LLM System View Audit - File System Features

**Date:** 2025-01-27  
**Status:** Audit Report - No Changes Made  
**Focus:** System environment visibility limitations for LLM when using file system features

---

## Executive Summary

The LLM currently has **limited system view** of the user's local environment when using file system features. While it has access to file system tools (`fs_read`, `fs_write`, `fs_list`, `cmd_execute`), it lacks **proactive system context** that would help it understand the environment without requiring explicit tool calls.

---

## Current System Context Provided to LLM

### 1. **File Context** (✅ Implemented)
**Location:** `components/chat/chat-interface.tsx` - `buildFileContextMessage()`

**What's Provided:**
- List of open files in the editor
- Full file paths and contents
- Active file identification
- File modification status
- Home directory inference (from file paths)

**Limitations:**
- Only includes files currently open in editor
- Home directory is **inferred** from file paths, not explicitly provided
- No system-wide file tree visibility
- No knowledge of file system structure beyond open files

### 2. **Tool Capabilities Message** (✅ Implemented)
**Location:** `components/chat/chat-interface.tsx` - `buildToolCapabilitiesMessage()`

**What's Provided:**
- Available tools (`fs_read`, `fs_write`, `fs_list`, `cmd_execute`)
- Security mode (SAFE/BALANCED/UNRESTRICTED)
- Command execution permissions based on mode
- Workflow instructions for using tools

**Limitations:**
- Describes **what** tools are available, not **what** the system looks like
- No actual system information (OS type, paths, installed software)
- No current working directory context
- No environment variable visibility

### 3. **General Workspace Context** (⚠️ Partial)
**Location:** `components/chat/chat-interface.tsx` - `buildFileContextMessage()`

**What's Provided:**
- Assumption that user works from home directory
- Generic instructions: "Assume the user is working from their local home directory"

**Limitations:**
- **No actual home directory path** provided
- **No OS type** information
- **No current working directory** provided
- **No PATH** or environment variable information
- Generic assumptions, not actual system data

---

## Critical Missing System Information

### 🔴 **1. Operating System Type**
**Current State:** Not provided to LLM  
**Impact:** LLM must infer OS from file paths or command results  
**Example Issue:** LLM doesn't know if it's Linux, macOS, or Windows until it runs commands

**What Should Be Provided:**
```typescript
{
  os: "linux" | "darwin" | "win32",
  platform: "linux",
  arch: "x64",
  version: "6.14.0-35-generic" // kernel version on Linux
}
```

**Location to Add:** System message in `buildFileContextMessage()` or new `buildSystemContextMessage()`

---

### 🔴 **2. Home Directory Path**
**Current State:** Inferred from file paths, not explicitly provided  
**Impact:** LLM must guess home directory or use `~` which may not resolve correctly

**What Should Be Provided:**
```typescript
{
  homeDirectory: "/home/dp", // Actual resolved path
  user: "dp" // Username
}
```

**Current Code Issue:**
- `buildFileContextMessage()` has `inferHomeDirectory()` function that extracts from paths
- But **never actually provides the home directory** to the LLM
- Only provides generic instruction: "Assume the user is working from their local home directory"

**Location:** `components/chat/chat-interface.tsx:101-128` - Function exists but result not used

---

### 🔴 **3. Current Working Directory**
**Current State:** Not provided  
**Impact:** LLM doesn't know where commands will execute by default  
**Example Issue:** When user says "list files here", LLM doesn't know what "here" means

**What Should Be Provided:**
```typescript
{
  currentWorkingDirectory: "/home/dp/Desktop/operastudio-11.0",
  // Or from MCP server's process.cwd()
}
```

**MCP Server Context:**
- `mcp-server/src/tools/command.ts:51` - Uses `process.cwd()` but LLM doesn't know this
- `mcp-server/src/tools/filesystem.ts` - No default working directory context

---

### 🔴 **4. System Paths & Environment**
**Current State:** Not provided  
**Impact:** LLM must discover system paths through commands  
**Example Issue:** LLM doesn't know `/usr/bin`, `/snap/bin`, `~/.local/bin` exist until it lists them

**What Should Be Provided:**
```typescript
{
  path: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin",
  commonPaths: {
    bin: "/usr/bin",
    localBin: "/usr/local/bin",
    snapBin: "/snap/bin",
    homeBin: "/home/dp/.local/bin",
    // OS-specific paths
  }
}
```

**Current Workaround:**
- LLM is instructed to check multiple locations (`which`, `snap list`, `dpkg`)
- But this requires **multiple tool calls** instead of having the information upfront

---

### 🔴 **5. Installed Software Inventory**
**Current State:** Not provided  
**Impact:** LLM must run discovery commands (`which`, `snap list`, `dpkg`) for every query  
**Example Issue:** User asks "Is Opera installed?" - LLM must run multiple commands instead of checking a provided list

**What Should Be Provided:**
```typescript
{
  installedPackages: {
    snap: ["opera", "firefox", "code"],
    apt: ["git", "nodejs", "npm"],
    // Or at least common executables in PATH
  },
  availableCommands: ["git", "node", "npm", "opera", "firefox"]
}
```

**Current Code:**
- `components/chat/chat-interface.tsx:371-382` - Instructions tell LLM to check multiple sources
- But this is **reactive discovery**, not **proactive information**

---

### 🔴 **6. File System Structure Overview**
**Current State:** Only open files visible  
**Impact:** LLM has no understanding of project structure, directory tree, or file organization  
**Example Issue:** User says "check the config files" - LLM doesn't know what directories exist

**What Should Be Provided:**
```typescript
{
  workspaceRoot: "/home/dp/Desktop/operastudio-11.0",
  directoryStructure: {
    // Top-level directories at least
    directories: ["components", "app", "lib", "mcp-server"],
    // Or provide via fs_list at workspace root
  }
}
```

**Current Limitation:**
- LLM only sees files **currently open in editor**
- No visibility into directory structure
- Must use `fs_list` tool to discover structure

---

### 🟡 **7. System Resources & Limits**
**Current State:** Not provided  
**Impact:** LLM doesn't know disk space, memory, or system capabilities  
**Example Issue:** LLM might try to read a 10GB file without knowing system limits

**What Should Be Provided:**
```typescript
{
  systemInfo: {
    totalMemory: "16GB",
    availableMemory: "8GB",
    diskSpace: { total: "500GB", available: "200GB" },
    // Or at least warnings about large file operations
  }
}
```

---

### 🟡 **8. Network & Connectivity**
**Current State:** Not provided  
**Impact:** LLM doesn't know if system can access internet, network shares, etc.  
**Example Issue:** LLM might try to download packages without knowing network status

---

## How System Information Could Be Obtained

### **From MCP Server Process**
The MCP server runs as a Node.js process and has access to:
- `os.homedir()` - Home directory
- `os.platform()` - OS platform
- `os.arch()` - Architecture
- `os.userInfo()` - User information
- `process.cwd()` - Current working directory
- `process.env.PATH` - PATH environment variable
- `process.env` - All environment variables

**Current Issue:** This information is **never collected or sent to the LLM**

### **From System Commands**
Information could be gathered via:
- `uname -a` - System information
- `whoami` - Current user
- `pwd` - Current directory
- `echo $PATH` - PATH variable
- `snap list` - Installed snaps
- `dpkg -l` - Installed packages (Linux)

**Current Issue:** These commands are **not run proactively** - LLM must request them

---

## Recommended Solutions

### **Solution 1: System Context Message** (Recommended)
**Add a new system message** that provides system information proactively.

**Implementation:**
1. Create `buildSystemContextMessage()` function in `components/chat/chat-interface.tsx`
2. Query system information from MCP server or backend API
3. Include in system messages sent to LLM

**System Context Should Include:**
```typescript
{
  os: {
    platform: "linux",
    arch: "x64",
    version: "6.14.0-35-generic"
  },
  user: {
    homeDirectory: "/home/dp",
    username: "dp",
    currentWorkingDirectory: "/home/dp/Desktop/operastudio-11.0"
  },
  environment: {
    path: "/usr/local/sbin:/usr/local/bin:...",
    shell: "/usr/bin/bash"
  },
  workspace: {
    root: "/home/dp/Desktop/operastudio-11.0",
    topLevelDirectories: ["components", "app", "lib", "mcp-server"]
  }
}
```

### **Solution 2: MCP Server System Info Tool**
**Add a new MCP tool** `system_info` that returns system context.

**Benefits:**
- LLM can query system info when needed
- Information is always current
- Can be called proactively by LLM

**Drawback:**
- Still requires LLM to make tool call
- Not as efficient as providing upfront

### **Solution 3: Backend System Info API**
**Create API endpoint** `/api/system/info` that returns system context.

**Flow:**
1. Frontend calls `/api/system/info` when MCP session starts
2. Backend queries MCP server process for system info
3. Frontend includes in system message to LLM

**Benefits:**
- Centralized system info gathering
- Can cache and update periodically
- Frontend can include in every message

---

## Current Workarounds & Their Limitations

### **Workaround 1: Discovery Commands**
**Current:** LLM is instructed to run `which`, `snap list`, `dpkg` to discover software.

**Limitations:**
- Requires multiple tool calls
- Slow and inefficient
- LLM must remember to do this for every query
- No proactive information

**Code Location:** `components/chat/chat-interface.tsx:371-382`

### **Workaround 2: Path Inference**
**Current:** LLM infers home directory from open file paths.

**Limitations:**
- Only works if files are open
- May be incorrect if files are in non-standard locations
- Not explicit or reliable

**Code Location:** `components/chat/chat-interface.tsx:101-128` - Function exists but not used effectively

### **Workaround 3: Generic Instructions**
**Current:** LLM is told to "assume" things about the system.

**Limitations:**
- Assumptions may be wrong
- No actual system data
- LLM must discover through trial and error

**Code Location:** `components/chat/chat-interface.tsx:130-133`

---

## Impact Analysis

### **User Experience Impact**
- **Slower responses:** LLM must run discovery commands before answering
- **More tool calls:** Each system query requires multiple tool invocations
- **Less accurate:** LLM may make incorrect assumptions about system

### **Efficiency Impact**
- **Higher latency:** Multiple round-trips for system discovery
- **More API calls:** Each discovery command is a separate MCP call
- **Higher token usage:** More tool calls = more tokens consumed

### **Functionality Impact**
- **Limited system awareness:** LLM doesn't understand full system context
- **Path resolution issues:** May use incorrect paths without explicit home directory
- **Command failures:** May try commands that don't exist or use wrong syntax for OS

---

## Code Locations for Implementation

### **Frontend (System Context Collection)**
- `components/chat/chat-interface.tsx` - Add `buildSystemContextMessage()`
- `lib/mcp/session-check.ts` - Could add system info query
- `contexts/filesystem-context.tsx` - Could store system info in context

### **Backend (System Info API)**
- `app/api/system/info/route.ts` - **NEW** - System info endpoint
- `app/api/mcp/call/route.ts` - Could add system info tool
- `app/api/mcp/start/route.ts` - Could collect system info on session start

### **MCP Server (System Info Tool)**
- `mcp-server/src/tools/system.ts` - **NEW** - System info tool
- `mcp-server/src/index.ts` - Register system info tool

---

## Priority Recommendations

### **🔴 High Priority**
1. **Provide explicit home directory path** - Currently inferred, should be explicit
2. **Provide OS type** - Critical for command syntax and path handling
3. **Provide current working directory** - Essential for relative path resolution

### **🟡 Medium Priority**
4. **Provide PATH environment variable** - Helps LLM understand available commands
5. **Provide workspace root directory** - Helps LLM understand project structure
6. **Provide top-level directory listing** - Gives LLM basic file system structure

### **🟢 Low Priority**
7. **Provide installed software inventory** - Nice to have but can be discovered
8. **Provide system resources** - Only needed for edge cases
9. **Provide network status** - Only needed for specific operations

---

## Example: Before vs After

### **Before (Current State)**
```
System Message to LLM:
- "Assume the user is working from their local home directory"
- "You have access to fs_read, fs_write, fs_list, cmd_execute tools"
- [Open files context]

User: "What's in my home directory?"
LLM: [Must call fs_list with inferred path ~ or /home/unknown]
```

### **After (With System Context)**
```
System Message to LLM:
- OS: Linux (6.14.0-35-generic)
- Home Directory: /home/dp
- Current Working Directory: /home/dp/Desktop/operastudio-11.0
- PATH: /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin
- Workspace Root: /home/dp/Desktop/operastudio-11.0
- Top-level directories: components, app, lib, mcp-server
- [Open files context]

User: "What's in my home directory?"
LLM: [Can immediately call fs_list with /home/dp - no inference needed]
```

---

## Conclusion

The LLM currently operates with **limited system visibility** when using file system features. While it has powerful tools available, it lacks **proactive system context** that would enable more efficient and accurate interactions.

**Key Findings:**
1. ✅ File context (open files) is well implemented
2. ✅ Tool capabilities are clearly communicated
3. ❌ System information (OS, paths, directories) is missing
4. ❌ Home directory is inferred, not explicit
5. ❌ Current working directory is unknown
6. ❌ System structure must be discovered via tools

**Recommended Action:**
Implement **Solution 1** (System Context Message) to provide proactive system information to the LLM, eliminating the need for discovery commands and improving response accuracy and speed.

---

## Related Files

- `components/chat/chat-interface.tsx` - System message building
- `lib/chat/tool-definitions.ts` - Tool definitions
- `app/api/mcp/call/route.ts` - MCP tool proxy
- `mcp-server/src/index.ts` - MCP server implementation
- `mcp-server/src/tools/filesystem.ts` - File system tools
- `mcp-server/src/tools/command.ts` - Command execution tools
- `mcp-server/src/security.ts` - Security policy (has OS detection)

