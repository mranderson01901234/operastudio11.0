# Prisma Browser Error Fix

## Error Message
```
PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in ``).
```

## Root Cause

This error occurs when Next.js tries to bundle server-side code (Prisma, Sharp) for the browser. Our new image editing API routes use:
1. **Prisma** - for database access
2. **Sharp** - for image processing (Node.js native module)

Both are server-only dependencies that should never be included in the browser bundle.

## Solution Applied

### 1. Install Sharp
```bash
npm install sharp
```

Sharp was missing from `package.json` even though we were importing it in the new API routes.

### 2. Configure Webpack to Exclude Sharp from Client Bundle

Updated `next.config.ts`:

```typescript
webpack: (config, { isServer }) => {
  // Exclude Node.js built-in modules from client-side bundling
  if (!isServer) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      "fs/promises": false,
      path: false,
      os: false,
    };
  }
  
  // NEW: Mark sharp as external for client-side (it's a Node.js native module)
  if (!isServer) {
    config.externals = config.externals || [];
    config.externals.push('sharp');
  }
  
  return config;
}
```

### 3. Restart Dev Server

After installing `sharp` and updating `next.config.ts`, restart the development server:

```bash
# Stop the dev server (Ctrl+C)
npm run dev
```

## Why This Happens

### Incorrect: Server Code in Client Bundle
```
Browser
  ↓
Tries to import Prisma/Sharp
  ↓
Error: These are Node.js-only modules
```

### Correct: Server Code Stays on Server
```
Browser                          Server
  ↓                                ↓
Calls API route (fetch)    API route uses Prisma/Sharp
  ←                                ↓
Returns JSON                  Processes & responds
```

## Files Changed

1. **package.json** - Added `sharp` dependency (via npm install)
2. **next.config.ts** - Added `sharp` to webpack externals

## API Routes (Server-Side Only)

These routes are server-side and should never be imported directly in client components:

- ✅ `app/api/imagen/filter/route.ts` - Server only
- ✅ `app/api/imagen/crop/route.ts` - Server only
- ✅ `app/api/imagen/resize/route.ts` - Server only
- ✅ `app/api/imagen/adjust/route.ts` - Server only
- ✅ `app/api/imagen/rotate/route.ts` - Server only
- ✅ `app/api/imagen/format/route.ts` - Server only

## How to Use API Routes Correctly

### ❌ WRONG - Direct Import (Causes Prisma Error)
```typescript
// In a client component
import { POST } from "@/app/api/imagen/filter/route";

// This tries to bundle Prisma/Sharp for browser!
```

### ✅ CORRECT - Fetch API
```typescript
// In a client component or tool handler
const response = await fetch("/api/imagen/filter", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ imageId: "current", filter: "blur" }),
});
```

## Verification

After restart, test:

1. **Generate Image:**
   ```
   User: "generate an image of a black lab puppy"
   ```
   Should work (already working)

2. **Edit Image:**
   ```
   User: "blur this image"
   ```
   Should work without Prisma error

3. **Check Browser Console:**
   - No Prisma errors
   - No Sharp errors
   - Image editing tools work correctly

## Related Documentation

- `IMAGEN_EDITING_FIX_SUMMARY.md` - Full image editing architecture
- `IMAGEN_EDIT_STREAMLINE_PLAN.md` - Design decisions

## Common Causes of This Error

1. **Missing Dependencies** - `sharp` not in package.json
2. **Incorrect Webpack Config** - Native modules not marked as external
3. **Direct Imports** - Importing API routes in client components
4. **Dev Server Not Restarted** - After config changes

## If Error Persists

1. **Check for Direct Imports:**
   ```bash
   # Search for any direct imports of API routes
   grep -r "from.*api/imagen.*route" .
   ```

2. **Clear Next.js Cache:**
   ```bash
   rm -rf .next
   npm run dev
   ```

3. **Verify Sharp Installation:**
   ```bash
   npm list sharp
   # Should show: sharp@0.x.x
   ```

4. **Check Browser Console:**
   - Look for any other bundling errors
   - Check Network tab for failed API calls

## Summary

**Problem**: Prisma and Sharp being bundled for browser  
**Cause**: Missing sharp dependency + webpack config  
**Fix**: Install sharp + exclude from client bundle + restart dev server  
**Result**: Image editing API routes work correctly server-side only

