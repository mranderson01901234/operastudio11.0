# Protocol URL Debugging Guide

## Current Issue

The protocol URL (`operastudio://connect?...`) is not reaching the launcher when it's already running.

## What I Fixed

1. **Added Single Instance Lock**
   - `app.requestSingleInstanceLock()` prevents multiple instances
   - Ensures `second-instance` event fires when protocol URL is opened

2. **Enhanced Logging**
   - Logs when `second-instance` event fires
   - Logs command line arguments
   - Logs protocol URL detection

## Testing Steps

1. **Restart the launcher:**
   ```bash
   cd launcher
   npm run dev
   ```

2. **Watch the launcher console** - you should see:
   ```
   === App Ready ===
   Process argv: [...]
   Platform: linux
   Found protocol URL in argv: none
   No protocol URL found in argv - launcher opened manually
   Waiting for protocol URL via second-instance event or open-url event...
   ```

3. **In web app, click "Connect Local Environment"**

4. **Check launcher console** - you should now see:
   ```
   === second-instance event ===
   Command line: [...]
   Protocol URL found in command line: operastudio://connect?...
   Handling protocol URL from second-instance...
   === handleProtocolUrl called ===
   ```

## If `second-instance` Event Doesn't Fire

The protocol handler might not be passing the URL correctly. Try:

### Option 1: Test Protocol Handler Directly

```bash
xdg-open "operastudio://connect?device_id=test&device_token=test&pair_nonce=test&user_id=test&origin=http://localhost:3000&expires=9999999999"
```

This should trigger the `second-instance` event if the launcher is running.

### Option 2: Check Desktop File

The desktop file should have:
```ini
Exec=/path/to/electron /path/to/launcher --no-sandbox %u
MimeType=x-scheme-handler/operastudio;
```

The `%u` placeholder passes the URL to the application.

### Option 3: Manual Testing

If the protocol handler isn't working, you can manually test by:

1. Getting the protocol URL from browser console (when you click Connect)
2. Copy the URL
3. In launcher DevTools console, run:
   ```javascript
   // This simulates receiving the protocol URL
   require('./dist/main/protocol-handler').handleProtocolUrl(
     'operastudio://connect?device_id=...',
     require('./dist/main/session-manager').SessionManager.getInstance(),
     require('electron').BrowserWindow.getAllWindows()[0]
   );
   ```

## Expected Flow

1. **Launcher starts** → Single instance lock acquired
2. **Web app opens protocol URL** → OS recognizes `operastudio://`
3. **OS tries to launch launcher** → Detects it's already running
4. **`second-instance` event fires** → Launcher receives URL
5. **`handleProtocolUrl()` called** → Device activation starts
6. **Mode selection shown** → User selects mode
7. **Session starts** → Backend API called

## Debugging Checklist

- [ ] Launcher is running (check process)
- [ ] Protocol handler is registered (`xdg-mime query default x-scheme-handler/operastudio`)
- [ ] Desktop file has `%u` placeholder
- [ ] `second-instance` event fires (check logs)
- [ ] Protocol URL is in command line (check logs)
- [ ] `handleProtocolUrl()` is called (check logs)
- [ ] Device activation succeeds (check logs)

## Next Steps

After restarting the launcher, try connecting again and check the console logs. The enhanced logging will show exactly where the flow is breaking.

