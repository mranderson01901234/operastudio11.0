# MCP Server Implementation

## Overview

Replaced Electron launcher with a lightweight headless MCP (Model Context Protocol) server.

## Architecture

```
User clicks "File System"
    ↓
Security Mode Selection UI
    ↓
User selects mode (Safe/Balanced/Unrestricted)
    ↓
Backend starts MCP server process
    ↓
MCP server exposes tools via stdio
    ↓
Web app connects to MCP server
    ↓
LLM can use tools (fs.read, fs.write, cmd.execute)
```

## User Flow

1. **Click "File System"** → Shows security mode selector
2. **Select Mode** → Click "Start Session"
3. **MCP Server Starts** → Headless process launches
4. **Connected** → Ready to use file system tools

## Security Modes

### Safe Mode
- Read-only access to home directory
- No command execution
- No write operations

### Balanced Mode
- Read/write to common directories
- Limited command execution (whitelist)
- System directories blocked

### Unrestricted Mode
- Full file system access
- All commands allowed
- Time-limited (10-30 min)

## MCP Tools

- `fs_read`: Read file contents
- `fs_write`: Write file contents
- `fs_list`: List directory contents
- `cmd_execute`: Execute shell commands (Balanced/Unrestricted only)

## Benefits Over Electron

✅ **Simpler**: No GUI, just a process
✅ **Faster**: Quick startup, lightweight
✅ **Standardized**: Uses MCP protocol
✅ **Headless**: Runs in background
✅ **Tool-based**: Designed for LLM tool access

## Files Created

- `mcp-server/` - MCP server package
- `app/api/mcp/start/route.ts` - Start MCP server API
- `app/api/mcp/stop/route.ts` - Stop MCP server API
- `components/filesystem/security-mode-selector.tsx` - Mode selection UI

## Next Steps

1. Test MCP server startup
2. Connect web app to MCP server
3. Integrate MCP tools with LLM
4. Add process management (track PIDs, cleanup on exit)

