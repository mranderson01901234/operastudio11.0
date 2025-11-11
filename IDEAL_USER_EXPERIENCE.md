# Ideal User Experience

## Current State (Temporary Workaround)

❌ **Manual copy-paste** - Not ideal for production

## Target User Experience

✅ **Seamless one-click connection** - Just click "Connect" and it works

---

## The Problem

On Linux, the `operastudio://` protocol handler doesn't reliably pass URLs to already-running applications via the `second-instance` event. This is a known limitation.

## Better Solution: Use Localhost HTTP Server

The launcher already runs a localhost HTTP server. We can use this instead of relying on the OS protocol handler.

### How It Would Work

1. **Web app calls `/api/devices/pair`** → Gets pairing data
2. **Web app discovers launcher** → Polls localhost ports or uses a known port
3. **Web app sends protocol URL to launcher** → `POST http://127.0.0.1:{port}/connect` with protocol URL
4. **Launcher receives URL** → Processes it immediately
5. **User selects mode** → Session starts

This eliminates the need for OS protocol handlers entirely!

---

## Implementation Options

### Option 1: HTTP Endpoint (Recommended)
- Add `POST /connect` endpoint to launcher's localhost server
- Web app discovers launcher port (poll common ports or use known port)
- Send protocol URL via HTTP POST
- **Pros:** Reliable, works on all platforms, no OS dependencies
- **Cons:** Need to discover launcher port

### Option 2: Fixed Port + Discovery
- Launcher uses a fixed port (e.g., 55754) or registers it somewhere
- Web app tries to connect to known port
- **Pros:** Simple, predictable
- **Cons:** Port conflicts possible

### Option 3: WebSocket Connection
- Launcher WebSocket server accepts connections
- Web app connects and sends protocol URL
- **Pros:** Real-time, bidirectional
- **Cons:** More complex

### Option 4: File-Based Communication
- Web app writes protocol URL to a file
- Launcher watches the file
- **Pros:** Simple
- **Cons:** File system permissions, cleanup needed

---

## Recommended: HTTP Endpoint Approach

This is the most reliable and works on all platforms without OS-specific protocol handlers.

