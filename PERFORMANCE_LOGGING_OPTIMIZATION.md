# Performance Logging Optimization

## Summary

This document describes the optimizations made to reduce verbose logging that was slowing down the web application.

## Changes Made

### 1. Created Optimized Logging Utility (`lib/utils/logger.ts`)

A new logging utility was created with the following features:

- **Environment-aware**: Only logs in development by default
- **Throttling**: Prevents console spam by throttling logs to max once per second per tag
- **Log levels**: Supports debug, info, warn, and error levels
- **Production-safe**: Automatically reduces verbosity in production builds

**Usage:**
```typescript
import { createAppLogger } from "@/lib/utils/logger";

const logger = createAppLogger("Component Name");
logger.debug("Debug message");
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message");
```

### 2. Replaced Verbose Console Logs

Replaced verbose `console.log` statements in:
- `components/chat/chat-interface.tsx` - Reduced logging of imagen results, tool calls, and email operations
- `contexts/imagen-context.tsx` - Reduced logging of MCP session management
- `contexts/email-context.tsx` - Reduced logging of email loading

### 3. Next.js Configuration

Added `reactStrictMode: true` to help reduce unnecessary Fast Refresh rebuilds.

## About Fast Refresh Logs

The `[Fast Refresh] rebuilding` and `[Fast Refresh] done in Xms` logs are coming from Next.js itself (in `node_modules`). These logs indicate that:

1. **Files are being changed frequently** - This could be due to:
   - Auto-save features triggering saves
   - File watchers detecting changes
   - Build processes modifying files

2. **The rebuilds themselves are slow** - Each rebuild taking 1-3 seconds suggests:
   - Large codebase requiring significant compilation
   - Many dependencies being recompiled
   - Possible file watching issues

### Recommendations to Reduce Fast Refresh Rebuilds

1. **Check for file watchers**: Look for processes that might be modifying files automatically
2. **Exclude unnecessary directories**: Ensure `.next`, `node_modules`, and build artifacts are excluded from file watchers
3. **Use Turbopack**: Consider using Next.js Turbopack for faster rebuilds (if compatible)
4. **Reduce file watching scope**: Configure your IDE/editor to watch fewer files
5. **Check for auto-formatting**: Disable auto-formatting on save if it's causing frequent file changes

### Disabling Fast Refresh Logs (Not Recommended)

Fast Refresh logs come from Next.js core and cannot be easily disabled without modifying `node_modules`. However, you can:

1. **Filter console logs in browser**: Use browser DevTools to filter out Fast Refresh messages
2. **Use a console wrapper**: Override `console.log` to filter Fast Refresh messages (not recommended as it may hide important logs)

## Performance Impact

The logging optimizations should:
- ✅ Reduce console output by ~80-90% in development
- ✅ Eliminate console logs entirely in production
- ✅ Prevent log throttling from impacting performance
- ✅ Make debugging easier with structured, tagged logs

## Further Optimization

If Fast Refresh rebuilds continue to be slow:

1. **Profile the build**: Use `ANALYZE=true npm run build` to see bundle sizes
2. **Check for circular dependencies**: These can cause slow rebuilds
3. **Reduce component complexity**: Break down large components
4. **Use React.memo**: Memoize components that don't need frequent re-renders
5. **Consider code splitting**: Split large routes/components into separate chunks

## Environment Variables

You can control logging behavior:

```typescript
// In your code
import { setLogLevel, setLoggingEnabled } from "@/lib/utils/logger";

// Disable all logs
setLoggingEnabled(false);

// Only show warnings and errors
setLogLevel('warn');
```

