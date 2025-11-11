# Interactive Web Tasks Solution

## Problem Statement

The LLM cannot download files from websites that require user interaction (e.g., selecting language edition, clicking buttons, filling forms). Examples:
- Windows ISO downloads (requires language/edition selection)
- Software downloads with license acceptance
- Forms requiring dropdown selections
- Multi-step download processes

## Solution Options

### Option 1: Browser Automation MCP Tool (Recommended)

**Technology:** Playwright or Puppeteer

**How it works:**
- Headless browser automation that can interact with web pages
- Fill forms, click buttons, select dropdowns
- Navigate multi-step processes
- Download files automatically

**Pros:**
- Handles complex interactive flows
- Can take screenshots for debugging
- Works with modern JavaScript-heavy sites
- Can wait for dynamic content to load

**Cons:**
- Requires browser installation (Chromium/Firefox)
- More resource-intensive than simple HTTP requests
- Slower than direct downloads

**Implementation:**
- Add `browser_automation` tool to MCP server
- Uses Playwright (more reliable than Puppeteer)
- Can be configured to run headless or with visible browser

### Option 2: Web Scraping + Form Automation

**Technology:** Cheerio + Form-data + HTTP requests

**How it works:**
- Parse HTML forms
- Extract form fields and options
- Submit forms programmatically
- Follow redirects to download URLs

**Pros:**
- Lightweight, no browser needed
- Fast execution
- Lower resource usage

**Cons:**
- Doesn't work with JavaScript-heavy sites
- Can't handle complex interactions
- May break if site structure changes

### Option 3: Hybrid Approach

**Technology:** Playwright for complex sites, HTTP requests for simple ones

**How it works:**
- Try simple HTTP request first
- Fall back to browser automation if interaction needed
- LLM decides which method to use

**Pros:**
- Best of both worlds
- Efficient for simple downloads
- Powerful for complex interactions

**Cons:**
- More complex implementation
- Requires decision logic

## Recommended Implementation: Browser Automation MCP Tool

### Architecture

```
LLM Request: "Download Windows 11 ISO"
    ↓
MCP Tool: browser_automation
    ↓
Playwright launches headless browser
    ↓
Navigate to download page
    ↓
Fill form: Select language, edition
    ↓
Click download button
    ↓
Wait for download to complete
    ↓
Return download path
```

### MCP Tool: `browser_automation`

**Parameters:**
- `url` (string): URL to navigate to
- `actions` (array): Sequence of actions to perform
  - `type: "navigate"` - Go to URL
  - `type: "click"` - Click element (selector)
  - `type: "fill"` - Fill input field (selector, value)
  - `type: "select"` - Select dropdown option (selector, value)
  - `type: "wait"` - Wait for element/network/timeout
  - `type: "screenshot"` - Take screenshot (optional, for debugging)
  - `type: "download"` - Wait for download and return path
- `headless` (boolean): Run in headless mode (default: true)
- `downloadPath` (string): Where to save downloads (default: ~/Downloads)

**Example Usage:**

```json
{
  "name": "browser_automation",
  "arguments": {
    "url": "https://www.microsoft.com/software-download/windows11",
    "actions": [
      {
        "type": "navigate",
        "url": "https://www.microsoft.com/software-download/windows11"
      },
      {
        "type": "click",
        "selector": "button#product-edition-select"
      },
      {
        "type": "select",
        "selector": "select#language",
        "value": "English"
      },
      {
        "type": "select",
        "selector": "select#edition",
        "value": "Windows 11"
      },
      {
        "type": "click",
        "selector": "button#download-button"
      },
      {
        "type": "wait",
        "waitFor": "download",
        "timeout": 300000
      },
      {
        "type": "download",
        "saveTo": "~/Downloads/windows11.iso"
      }
    ],
    "headless": true,
    "downloadPath": "~/Downloads"
  }
}
```

### Alternative: Simplified High-Level Tool

For common use cases, provide a simpler tool that handles common patterns:

**Tool: `interactive_download`**

```json
{
  "name": "interactive_download",
  "arguments": {
    "url": "https://www.microsoft.com/software-download/windows11",
    "formFills": {
      "language": "English",
      "edition": "Windows 11",
      "architecture": "64-bit"
    },
    "downloadButtonSelector": "button#download-button",
    "saveAs": "~/Downloads/windows11.iso"
  }
}
```

## Implementation Steps

1. **Add Playwright dependency** to MCP server
2. **Create browser automation tool** (`mcp-server/src/tools/browser.ts`)
3. **Add tool to MCP server** (`mcp-server/src/index.ts`)
4. **Update security policy** to allow browser automation
5. **Test with Windows ISO download**

## Security Considerations

- **Sandboxing:** Run browser in sandboxed environment
- **Timeouts:** Set reasonable timeouts for operations
- **Resource limits:** Limit memory/CPU usage
- **Download validation:** Verify downloaded files before returning
- **URL whitelist:** Optionally restrict to trusted domains

## Alternative Tools

### 1. Puppeteer MCP Server (Separate)
- Standalone MCP server for browser automation
- Can be used alongside filesystem MCP server
- Pros: Separation of concerns
- Cons: Additional process to manage

### 2. Selenium Grid
- More powerful but heavier
- Good for complex enterprise scenarios
- Overkill for simple downloads

### 3. curl/wget with cookies + headers
- Some sites can be tricked with proper headers/cookies
- Limited to sites without JavaScript requirements
- Fast but unreliable

## Recommendation

**Implement Option 1: Browser Automation MCP Tool using Playwright**

This provides the best balance of:
- ✅ Handles complex interactive websites
- ✅ Works with modern JavaScript-heavy sites
- ✅ Can be extended for other automation tasks
- ✅ Good debugging capabilities (screenshots)
- ✅ Reliable and well-maintained library

## Implementation Status

✅ **COMPLETED**

1. ✅ Added Playwright dependency to MCP server
2. ✅ Implemented `browser_automation` tool (`mcp-server/src/tools/browser.ts`)
3. ✅ Implemented `interactive_download` simplified tool
4. ✅ Integrated tools into MCP server (`mcp-server/src/index.ts`)
5. ✅ Added security policy checks
6. ✅ Created usage documentation (`BROWSER_AUTOMATION_USAGE.md`)

## Installation

To use the browser automation tools, you need to install Playwright browsers:

```bash
cd mcp-server
npm install
npx playwright install chromium
```

This will download Chromium browser binaries needed for automation.

## Testing

To test the browser automation:

1. Start MCP server in BALANCED or UNRESTRICTED mode
2. Use `browser_automation` or `interactive_download` tool
3. For debugging, set `headless: false` to see the browser

## Next Steps

1. Test with actual Windows ISO download site
2. Update LLM tool definitions/prompts to use browser automation
3. Add error handling improvements based on real-world usage
4. Consider adding retry logic for flaky websites

