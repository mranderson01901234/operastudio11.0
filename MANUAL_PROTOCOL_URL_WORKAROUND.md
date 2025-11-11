# Manual Protocol URL Workaround

## Problem

The `second-instance` event is not firing when the protocol URL is opened from the web app. This means the launcher doesn't receive the protocol URL automatically.

## Solution

I've added a **manual protocol URL input** in the launcher UI that appears after 3 seconds if no protocol URL is received.

## How to Use

1. **Start the launcher:**
   ```bash
   cd launcher
   npm run dev
   ```

2. **In the web app, click "Connect Local Environment"**

3. **Copy the protocol URL** from the browser console:
   - Open browser DevTools (F12)
   - Look for the protocol URL in the console or Network tab
   - Or check the "Open Launcher Again" button - right-click → Inspect → see the `href` attribute

4. **In the launcher window**, after 3 seconds, a "Manual Connection" section will appear

5. **Paste the protocol URL** into the input field and click "Connect"

6. **The launcher will process the URL** and activate the device

## Getting the Protocol URL

### Method 1: Browser Console
1. Open DevTools (F12)
2. Click "Connect Local Environment" in web app
3. In Console, you should see the protocol URL being opened
4. Or check Network tab for the protocol request

### Method 2: Inspect Element
1. Right-click "Open Launcher Again" button
2. Inspect Element
3. Look at the `onClick` handler or `href` attribute
4. Copy the protocol URL

### Method 3: From Context
The protocol URL format is:
```
operastudio://connect?device_id={id}&device_token={token}&pair_nonce={nonce}&user_id={userId}&origin={origin}&expires={timestamp}
```

You can construct it manually if you have the values from the pairing response.

## Why This Happens

On Linux, protocol handlers (`operastudio://`) don't always reliably pass URLs to already-running applications via the `second-instance` event. This is a known limitation of some Linux desktop environments.

## Long-term Fix

For production, we should:
1. Use a different mechanism (WebSocket, HTTP endpoint, etc.)
2. Or ensure the protocol handler always launches a new instance
3. Or use a system tray icon that can receive messages

For now, the manual workaround allows you to test the full flow.

