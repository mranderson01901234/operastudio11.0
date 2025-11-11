# OperaStudio MCP Server

Headless MCP (Model Context Protocol) server for local file system access.

## Features

- **Security Modes**: Safe, Balanced, Unrestricted
- **File Operations**: Read, write, list directories
- **Command Execution**: Execute shell commands (Balanced/Unrestricted only)
- **Path Restrictions**: Mode-based access control

## Security Modes

### Safe Mode
- Read-only access to user home directory
- No command execution
- No write operations

### Balanced Mode
- Read/write access to common directories
- Limited command execution (whitelist)
- System directories blocked

### Unrestricted Mode
- Full file system access
- All commands allowed
- Time-limited (10-30 minutes)

## Usage

### Development

```bash
cd mcp-server
npm install
npm run build
npm run dev  # Runs with SAFE mode by default
```

### Production

```bash
npm run build
node dist/index.js SAFE    # Safe mode
node dist/index.js BALANCED # Balanced mode
node dist/index.js UNRESTRICTED # Unrestricted mode
```

## MCP Tools

### `fs_read`
Read file contents.

**Parameters:**
- `path` (string, required): File path to read
- `maxBytes` (number, optional): Maximum bytes to read (default: 10MB)

### `fs_write`
Write file contents.

**Parameters:**
- `path` (string, required): File path to write
- `content` (string, required): Content to write
- `create` (boolean, optional): Create file if it doesn't exist (default: true)

### `fs_list`
List directory contents.

**Parameters:**
- `path` (string, required): Directory path to list
- `depth` (number, optional): Maximum depth to recurse (default: 1)
- `includeHidden` (boolean, optional): Include hidden files (default: false)

### `cmd_execute`
Execute shell command (Balanced/Unrestricted only).

**Parameters:**
- `command` (string, required): Command to execute
- `args` (array, optional): Command arguments
- `cwd` (string, optional): Working directory
- `timeout` (number, optional): Timeout in milliseconds (default: 30000)

## Protocol

Uses MCP (Model Context Protocol) over stdio transport. The server communicates via JSON-RPC 2.0.

