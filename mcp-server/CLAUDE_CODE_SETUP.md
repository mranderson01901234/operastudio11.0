# Claude Code Setup Guide

This guide explains how to connect the OperaStudio HTTPS MCP Server to Claude Code (Claude Desktop) for live code editing with UI updates.

## Prerequisites

1. **Claude Desktop** installed ([Download here](https://claude.ai/download))
2. **Node.js** 18+ installed
3. **OperaStudio MCP Server** built and ready

## Quick Start

### Option 1: HTTP (Development - No Certificates)

1. **Build the HTTPS server:**
   ```bash
   cd mcp-server
   npm install
   npm run build
   ```

2. **Start the server:**
   ```bash
   npm run start:https:dev
   # Or with custom port (default is 3001):
   npm run start:https:dev -- BALANCED 3001
   # Or for production:
   npm run start:https
   ```

3. **Configure Claude Code:**
   
   Edit Claude Desktop's configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

   **Important:** If the config file doesn't exist, create it first.

   Add this configuration:
   ```json
   {
     "mcpServers": {
       "operastudio-filesystem": {
         "transport": {
           "type": "http",
           "url": "https://localhost:3001/mcp"
         }
       }
     }
   }
   ```
   
   **Note:** 
   - The server uses **HTTPS by default** on port 3001
   - SSL certificates (`localhost.pem` and `localhost-key.pem`) are automatically generated
   - If you need HTTP instead, use: `npm run start:https:dev -- --http`

4. **Restart Claude Desktop** to load the new configuration

### Option 2: HTTPS (Production - Requires Certificates)

1. **Generate SSL certificates** (for localhost):
   ```bash
   # Using mkcert (recommended for local development)
   brew install mkcert  # macOS
   # or
   choco install mkcert  # Windows
   
   mkcert -install
   mkcert localhost 127.0.0.1 ::1
   # This creates localhost.pem and localhost-key.pem
   ```

2. **Start the server with HTTPS:**
   ```bash
   export MCP_HTTPS=true
   export MCP_CERT_PATH=./localhost.pem
   export MCP_KEY_PATH=./localhost-key.pem
   npm run start:https:dev
   ```

3. **Configure Claude Code** with HTTPS:
   ```json
   {
     "mcpServers": {
       "operastudio-filesystem": {
         "transport": {
           "type": "http",
           "url": "https://localhost:3001/mcp"
         }
       }
     }
   }
   ```

## Security Modes

The server supports three security modes:

- **SAFE**: Read-only access to home directory, no command execution
- **BALANCED**: Read/write to common directories, limited command execution
- **UNRESTRICTED**: Full file system access, all commands allowed

Set the mode via command line:
```bash
npm run start:https:dev -- BALANCED 3000
```

Or via environment variable:
```bash
export MCP_MODE=BALANCED
npm run start:https:dev
```

## Available Tools

Once connected, Claude Code can use these tools:

- **fs_read**: Read file contents
- **fs_write**: Write file contents (triggers live updates)
- **fs_list**: List directory contents
- **fs_delete**: Delete files or directories
- **cmd_execute**: Execute shell commands (BALANCED/UNRESTRICTED only)
- **browser_automation**: Automate browser interactions
- **interactive_download**: Download files from interactive websites

## Live UI Updates

The server includes a live updates endpoint at `/updates` that uses Server-Sent Events (SSE) to broadcast file changes in real-time. This allows your web UI to automatically refresh when Claude edits files.

### Connecting to Live Updates

```javascript
const eventSource = new EventSource('https://localhost:3001/updates');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'file_update') {
    // Refresh UI or reload file
    console.log('File updated:', data.path);
  }
};
```

## Troubleshooting

### Server won't start

- Check if port 3001 is already in use: `lsof -i :3001` (macOS/Linux) or `netstat -ano | findstr :3001` (Windows)
- Change the port: `npm run start:https:dev -- SAFE 3002`
- Default port is 3001 to avoid conflicts with Next.js (port 3000)

### Claude Code can't connect

- Verify the server is running: `curl -k https://localhost:3001/health` (use `-k` to ignore self-signed cert warnings)
- Check Claude Desktop logs for connection errors
- Ensure the URL in `claude_desktop_config.json` uses `https://` and matches your server port
- Make sure you restarted Claude Desktop after editing the config file
- For self-signed certificates, Claude Desktop may show a warning - this is normal for localhost

### HTTPS certificate errors

- For localhost, use `mkcert` to generate trusted certificates
- Or use HTTP for development (less secure but simpler)

### Permission denied errors

- Check file permissions on the paths you're trying to access
- Try a different security mode (BALANCED or UNRESTRICTED)
- Ensure the server process has read/write access to target directories

## Example Usage

Once connected, you can ask Claude Code:

- "Read the file at `/home/user/project/src/index.ts`"
- "Write a new function to `src/utils.ts`"
- "List all files in `/home/user/project`"
- "Execute `npm install` in `/home/user/project`"

Claude will use the MCP tools automatically, and your web UI will receive live updates when files are modified.

## Next Steps

- Set up file watching to automatically detect external file changes
- Configure authentication for production deployments
- Add custom tools specific to your workflow
- Set up monitoring and logging

