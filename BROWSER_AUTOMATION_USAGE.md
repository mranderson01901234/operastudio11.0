# Browser Automation Tool Usage Guide

## Overview

The browser automation tools allow the LLM to interact with websites that require user input, such as:
- Windows ISO downloads (language/edition selection)
- Software downloads with license acceptance
- Forms requiring dropdown selections
- Multi-step download processes

## Available Tools

### 1. `browser_automation` - Full Control

Provides complete control over browser interactions with a sequence of actions.

**Example: Download Windows 11 ISO**

```json
{
  "name": "browser_automation",
  "arguments": {
    "url": "https://www.microsoft.com/software-download/windows11",
    "actions": [
      {
        "type": "navigate",
        "url": "https://www.microsoft.com/software-download/windows11",
        "waitFor": "domcontentloaded"
      },
      {
        "type": "wait",
        "selector": "select#product-edition-select",
        "timeout": 10000
      },
      {
        "type": "select",
        "selector": "select#product-edition-select",
        "value": "Windows 11",
        "options": "label"
      },
      {
        "type": "select",
        "selector": "select#product-languages",
        "value": "English",
        "options": "label"
      },
      {
        "type": "click",
        "selector": "button#download-button"
      },
      {
        "type": "wait",
        "waitFor": "download",
        "timeout": 600000
      },
      {
        "type": "download",
        "saveTo": "~/Downloads/windows11.iso"
      }
    ],
    "headless": true,
    "timeout": 600000
  }
}
```

### 2. `interactive_download` - Simplified

Simplified tool for common download scenarios with form filling.

**Example: Download Windows 11 ISO (Simplified)**

```json
{
  "name": "interactive_download",
  "arguments": {
    "url": "https://www.microsoft.com/software-download/windows11",
    "formFills": {
      "select#product-edition-select": "Windows 11",
      "select#product-languages": "English"
    },
    "downloadButtonSelector": "button#download-button",
    "saveAs": "~/Downloads/windows11.iso",
    "headless": true
  }
}
```

## Action Types

### `navigate`
Navigate to a URL.

```json
{
  "type": "navigate",
  "url": "https://example.com",
  "waitFor": "domcontentloaded" // or "load", "networkidle"
}
```

### `click`
Click an element.

```json
{
  "type": "click",
  "selector": "button#submit"
}
```

### `fill`
Fill an input field.

```json
{
  "type": "fill",
  "selector": "input#username",
  "value": "myusername"
}
```

### `select`
Select an option from a dropdown.

```json
{
  "type": "select",
  "selector": "select#language",
  "value": "English",
  "options": "label" // or "value", "index"
}
```

### `wait`
Wait for a condition.

```json
{
  "type": "wait",
  "waitFor": "download", // or "load", "networkidle", "domcontentloaded", or a CSS selector
  "timeout": 60000
}
```

Or wait for a selector:

```json
{
  "type": "wait",
  "selector": "div#content",
  "timeout": 10000
}
```

Or wait for a specific time:

```json
{
  "type": "wait",
  "value": "2000" // milliseconds
}
```

### `screenshot`
Take a screenshot (useful for debugging).

```json
{
  "type": "screenshot",
  "screenshotPath": "~/Downloads/screenshot.png"
}
```

### `download`
Wait for a download and save it.

```json
{
  "type": "download",
  "saveTo": "~/Downloads/file.iso"
}
```

### `extract_text`
Extract text from an element.

```json
{
  "type": "extract_text",
  "selector": "div#content"
}
```

### `get_url`
Get the current URL (no parameters needed).

```json
{
  "type": "get_url"
}
```

## Common Patterns

### Pattern 1: Simple Form Submission

```json
{
  "url": "https://example.com/download",
  "actions": [
    { "type": "fill", "selector": "input#name", "value": "John" },
    { "type": "select", "selector": "select#version", "value": "2.0" },
    { "type": "click", "selector": "button#submit" },
    { "type": "wait", "waitFor": "download", "timeout": 300000 },
    { "type": "download", "saveTo": "~/Downloads/file.zip" }
  ]
}
```

### Pattern 2: Multi-Step Process

```json
{
  "url": "https://example.com/step1",
  "actions": [
    { "type": "click", "selector": "button#next" },
    { "type": "wait", "selector": "form#step2", "timeout": 10000 },
    { "type": "fill", "selector": "input#email", "value": "user@example.com" },
    { "type": "click", "selector": "button#submit" },
    { "type": "wait", "waitFor": "download", "timeout": 300000 },
    { "type": "download", "saveTo": "~/Downloads/file.zip" }
  ]
}
```

### Pattern 3: Debugging with Screenshots

```json
{
  "url": "https://example.com",
  "actions": [
    { "type": "screenshot", "screenshotPath": "~/Downloads/before.png" },
    { "type": "click", "selector": "button#action" },
    { "type": "wait", "waitFor": "networkidle" },
    { "type": "screenshot", "screenshotPath": "~/Downloads/after.png" }
  ]
}
```

## Security Considerations

- Browser automation is only available in **BALANCED** and **UNRESTRICTED** modes
- Downloads are saved to `~/Downloads` by default (or specified path)
- All download paths are validated against security policy
- Browser runs in sandboxed environment
- Timeouts prevent infinite waits

## Troubleshooting

### Issue: Select action fails

**Solution:** The element might not be a `<select>`. Try using `fill` action instead, or inspect the page to find the correct selector.

### Issue: Download doesn't start

**Solution:** 
1. Take a screenshot to see the current state
2. Check if the download button selector is correct
3. Increase the timeout for the wait action
4. Try waiting for "networkidle" before clicking download

### Issue: Element not found

**Solution:**
1. Add a `wait` action before interacting with the element
2. Use `wait` with the selector to ensure it's loaded
3. Check if the page uses dynamic loading (try waiting for "networkidle")

### Issue: Wrong file downloaded

**Solution:**
1. Use `extract_text` to verify the current state
2. Take screenshots at each step
3. Check if multiple download buttons exist (use more specific selector)

## Best Practices

1. **Always wait for elements** before interacting with them
2. **Use specific selectors** (IDs are better than classes)
3. **Set appropriate timeouts** for large downloads
4. **Take screenshots** when debugging
5. **Use `interactive_download`** for simple cases, `browser_automation` for complex flows
6. **Test in non-headless mode** (`headless: false`) to see what's happening

## Example: Complete Windows ISO Download Flow

```json
{
  "name": "browser_automation",
  "arguments": {
    "url": "https://www.microsoft.com/software-download/windows11",
    "actions": [
      {
        "type": "navigate",
        "url": "https://www.microsoft.com/software-download/windows11",
        "waitFor": "domcontentloaded"
      },
      {
        "type": "wait",
        "selector": "select#product-edition-select",
        "timeout": 15000
      },
      {
        "type": "screenshot",
        "screenshotPath": "~/Downloads/before-selection.png"
      },
      {
        "type": "select",
        "selector": "select#product-edition-select",
        "value": "Windows 11 (multi-edition ISO)",
        "options": "label"
      },
      {
        "type": "select",
        "selector": "select#product-languages",
        "value": "English (United States)",
        "options": "label"
      },
      {
        "type": "click",
        "selector": "button#download-button"
      },
      {
        "type": "wait",
        "waitFor": "networkidle",
        "timeout": 10000
      },
      {
        "type": "wait",
        "waitFor": "download",
        "timeout": 600000
      },
      {
        "type": "download",
        "saveTo": "~/Downloads/windows11.iso"
      }
    ],
    "headless": false, // Set to false to see what's happening
    "timeout": 600000
  }
}
```

