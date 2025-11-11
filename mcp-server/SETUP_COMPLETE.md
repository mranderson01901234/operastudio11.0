# ✅ MCP HTTPS Server Setup Complete

The HTTPS MCP server has been successfully set up and is ready to use!

## Quick Start

### 1. Start the Server

```bash
cd mcp-server
npm run start:https:dev
```

The server will start on **port 3001** (default) to avoid conflicts with Next.js.

### 2. Test the Server

Open a new terminal and test the health endpoint:

```bash
curl -k https://localhost:3001/health
```

(Use `-k` flag to ignore self-signed certificate warnings)

You should see:
```json
{
  "status": "ok",
  "mode": "SAFE",
  "server": "operastudio-filesystem",
  "version": "0.1.0"
}
```

### 3. Connect Claude Code

Edit Claude Desktop's config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

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

**Note:** The server uses HTTPS by default. SSL certificates are automatically generated.

**Important:** Restart Claude Desktop after editing the config!

### 4. Test Live Updates

Open `examples/live-updates-client.html` in your browser to see live file updates when Claude edits files.

## Available Commands

- `npm run start:https:dev` - Start in development mode (default port 3001)
- `npm run start:https:dev -- BALANCED 3002` - Start with custom mode and port
- `npm run build` - Build for production
- `npm run start:https` - Run production build

## Troubleshooting

### Port Already in Use

If you see "EADDRINUSE" error, the server will show helpful instructions. Use a different port:

```bash
npm run start:https:dev -- BALANCED 3002
```

### Claude Code Can't Connect

1. Verify server is running: `curl -k https://localhost:3001/health`
2. Check that the URL in Claude config uses `https://` and matches the server port
3. Make sure you restarted Claude Desktop
4. Check Claude Desktop logs for errors
5. Self-signed certificate warnings are normal - accept them in Claude Desktop

## Next Steps

- Read `CLAUDE_CODE_SETUP.md` for detailed setup instructions
- Read `README_HTTPS.md` for full documentation
- Test file operations with Claude Code
- Connect your web UI to the `/updates` SSE endpoint for live updates

## Server Endpoints

- **MCP Protocol**: `https://localhost:3001/mcp` (used by Claude Code)
- **Health Check**: `https://localhost:3001/health`
- **Live Updates**: `https://localhost:3001/updates` (SSE stream)

**All endpoints use HTTPS by default!**

Enjoy your live code editing with Claude Code! 🎉

