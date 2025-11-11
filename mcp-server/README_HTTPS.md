# OperaStudio HTTPS MCP Server

An HTTPS-enabled MCP server for connecting OperaStudio to Claude Code (Claude Desktop) with live UI updates.

## Features

- ✅ **HTTP/HTTPS Transport**: Uses StreamableHTTPServerTransport for web compatibility
- ✅ **Live Updates**: Server-Sent Events (SSE) for real-time file change notifications
- ✅ **Security Modes**: Safe, Balanced, and Unrestricted modes
- ✅ **File Operations**: Read, write, list, and delete files
- ✅ **Command Execution**: Execute shell commands (BALANCED/UNRESTRICTED modes)
- ✅ **Browser Automation**: Automated web interactions and downloads

## Quick Start

### 1. Install Dependencies

```bash
cd mcp-server
npm install
```

### 2. Build the Server

```bash
npm run build
```

### 3. Start the Server

**HTTP Mode (Development):**
```bash
npm run start:https:dev
# Or with custom mode/port (default port is 3001):
npm run start:https:dev -- BALANCED 3001
```

**HTTPS Mode (Production):**
```bash
export MCP_HTTPS=true
export MCP_CERT_PATH=./localhost.pem
export MCP_KEY_PATH=./localhost-key.pem
npm run start:https:dev
```

### 4. Configure Claude Code

Edit Claude Desktop's config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude\claude_desktop_config.json`

Add:
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
- Server uses **HTTPS by default** on port 3001
- SSL certificates are auto-generated (`localhost.pem` and `localhost-key.pem`)
- For HTTP mode, use: `npm run start:https:dev -- --http`

Restart Claude Desktop.

## API Endpoints

### MCP Protocol Endpoint
- **POST** `/mcp` - Main MCP protocol endpoint (used by Claude Code)

### Health Check
- **GET** `/health` - Server health and status

### Live Updates (SSE)
- **GET** `/updates` - Server-Sent Events stream for file changes

## Live Updates Integration

Connect to the SSE stream to receive real-time file update notifications:

```javascript
const eventSource = new EventSource('https://localhost:3001/updates');

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'file_update') {
    console.log('File updated:', data.path);
    console.log('Action:', data.action); // 'updated' or 'deleted'
    console.log('Timestamp:', data.timestamp);
    
    // Refresh your UI or reload the file
    refreshFileInUI(data.path);
  }
});

eventSource.addEventListener('error', (error) => {
  console.error('SSE connection error:', error);
});
```

## Security Modes

### SAFE Mode
- Read-only access to home directory
- No command execution
- No write operations

### BALANCED Mode (Recommended)
- Read/write to common directories
- Limited command execution (whitelist)
- System directories blocked

### UNRESTRICTED Mode
- Full file system access
- All commands allowed
- Use with caution!

## Environment Variables

- `MCP_MODE` - Security mode: `SAFE`, `BALANCED`, or `UNRESTRICTED`
- `MCP_PORT` - Server port (default: 3001)
- `MCP_HTTPS` - Enable HTTPS: `true` or `false`
- `MCP_CERT_PATH` - Path to SSL certificate file
- `MCP_KEY_PATH` - Path to SSL private key file

## Command Line Usage

```bash
# Basic usage
node dist/https-server.js [MODE] [PORT] [--https]

# Examples
node dist/https-server.js BALANCED 3001
node dist/https-server.js SAFE 3001 --https
node dist/https-server.js UNRESTRICTED 8080
```

## SSL Certificates for HTTPS

### Using mkcert (Recommended for Local Development)

```bash
# Install mkcert
brew install mkcert  # macOS
# or
choco install mkcert  # Windows

# Install local CA
mkcert -install

# Generate certificates
mkcert localhost 127.0.0.1 ::1

# This creates:
# - localhost.pem (certificate)
# - localhost-key.pem (private key)
```

### Using OpenSSL (Self-Signed)

```bash
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout localhost-key.pem \
  -out localhost.pem \
  -days 365 \
  -subj "/CN=localhost"
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3001
lsof -i :3001  # macOS/Linux
netstat -ano | findstr :3001  # Windows

# Kill the process or use a different port
# The server will show a helpful error message with instructions
```

### Claude Code Connection Issues
1. Verify server is running: `curl -k https://localhost:3001/health` (use `-k` for self-signed certs)
2. Check Claude Desktop logs for errors
3. Ensure URL in config uses `https://` and matches server port
4. Restart Claude Desktop after config changes
5. Make sure the config file exists and is valid JSON
6. Self-signed certificate warnings are normal for localhost - accept them in Claude Desktop

### HTTPS Certificate Errors
- Use `mkcert` for trusted localhost certificates
- Or use HTTP for development (less secure but simpler)
- For production, use proper SSL certificates from a CA

## Development

```bash
# Watch mode (auto-reload on changes)
npm run dev:https

# Build for production
npm run build

# Run production build
npm run start:https
```

## Architecture

```
┌─────────────┐
│ Claude Code │
└──────┬──────┘
       │ HTTP/HTTPS
       │ POST /mcp
       ▼
┌─────────────────────┐
│ HTTPS MCP Server    │
│ - Express           │
│ - StreamableHTTP    │
│ - MCP SDK           │
└──────┬──────────────┘
       │
       ├──► File System Tools
       ├──► Command Tools
       └──► Browser Tools
       
       │
       ▼
┌─────────────────────┐
│ SSE Broadcast       │
│ GET /updates        │
└──────┬──────────────┘
       │
       ▼
┌─────────────┐
│ Web UI      │
│ (Live Updates)│
└─────────────┘
```

## License

MIT

