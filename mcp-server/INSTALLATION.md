# MCP Server Installation

## Prerequisites

- Node.js 18+ 
- npm or yarn

## Installation Steps

1. **Install dependencies:**
   ```bash
   cd mcp-server
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```
   
   This downloads Chromium browser binaries needed for browser automation tools.

3. **Build the server:**
   ```bash
   npm run build
   ```

## Development

Run in development mode with auto-reload:

```bash
npm run dev
```

## Usage

Start the server with a security mode:

```bash
# Safe mode (read-only)
node dist/index.js SAFE

# Balanced mode (limited access)
node dist/index.js BALANCED

# Unrestricted mode (full access)
node dist/index.js UNRESTRICTED
```

Or set via environment variable:

```bash
MCP_MODE=BALANCED node dist/index.js
```

## Available Tools

### File System Tools (All Modes)
- `fs_read` - Read file contents
- `fs_write` - Write file contents
- `fs_list` - List directory contents
- `fs_delete` - Delete files/directories

### Command Tools (Balanced/Unrestricted Only)
- `cmd_execute` - Execute shell commands

### Browser Automation Tools (Balanced/Unrestricted Only)
- `browser_automation` - Full browser automation with action sequences
- `interactive_download` - Simplified interactive downloads

## Browser Automation Requirements

The browser automation tools require:
- Playwright installed (`npm install playwright`)
- Chromium browser installed (`npx playwright install chromium`)

These are automatically installed when you run `npm install` in the mcp-server directory.

