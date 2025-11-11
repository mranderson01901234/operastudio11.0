# MCP Session Auto-Start Audit

## Problem Statement
**Image-editing MCP sessions are NOT automatically starting when images are generated or uploaded.** Sessions should be triggered automatically whenever an image is displayed in the Image Generation view.

---

## Current Flow Analysis

### 1. Image Generation Flow

**Location:** `components/chat/chat-interface.tsx`

**Current Process:**
1. User says "generate an image of..."
2. LLM calls `imagen_generate` tool
3. `startGeneration()` called (line ~1417) - sets `isGenerating = true`
4. Tool executes via `/api/imagen/generate`
5. On success → `completeGeneration()` called (line ~1912)
6. `completeGeneration()` updates imagen context with `currentImage` (line 95 in `contexts/imagen-context.tsx`)
7. Image displays in UI

**❌ MISSING:** No session auto-start after `completeGeneration()`

---

### 2. Image Upload Flow

**Status:** ❌ **NOT IMPLEMENTED YET**

There is no image upload functionality in the codebase. Need to add:
- File input component
- Upload endpoint (`/api/imagen/upload`)
- Upload handler that calls `completeGeneration()`

**When implemented, should also trigger session auto-start.**

---

### 3. Image Selection from History

**Location:** `contexts/imagen-context.tsx` (line ~168)

**Current Process:**
1. User clicks image from history
2. `setCurrentImageFromHistory()` called
3. Sets `currentImage` in state
4. Opens view

**❌ MISSING:** No session auto-start when selecting from history

---

## Where Sessions Currently Start

### Current Auto-Start Logic

**Location:** `components/chat/chat-interface.tsx` (line ~1709)

**Trigger:** Only when imagen editing tool call FAILS with "session not found" error

**Process:**
1. Tool call fails → error contains "Image editing MCP session not found"
2. Auto-start logic triggers
3. Calls `/api/mcp/start` with `serverType: "image-editing"`
4. Waits 1 second
5. Retries tool call

**Problem:** This is REACTIVE, not PROACTIVE. User has to try editing first, fail, then session starts.

---

## What Should Happen

### Expected Behavior

**When an image is displayed (via any method):**
1. Check if `image-editing` session exists for user
2. If not, automatically start one
3. Session should be ready BEFORE user tries to edit

**Trigger Points:**
- ✅ After `completeGeneration()` completes (image generated)
- ✅ After `setCurrentImageFromHistory()` (image selected from history)
- ✅ After image upload completes (when implemented)

---

## Root Cause

**The `completeGeneration()` function does NOT check for or start MCP sessions.**

**Current Code:**
```typescript
// contexts/imagen-context.tsx (line 88)
const completeGeneration = useCallback((image: Omit<GeneratedImage, "id" | "generatedAt">, imageId?: string) => {
  const newImage: GeneratedImage = {
    ...image,
    id: imageId || generateImageId(),
    generatedAt: Date.now(),
  };
  
  setCurrentImage(newImage);
  setIsGenerating(false);
  // ... rest of function
  
  // ❌ NO SESSION CHECK OR START HERE
}, []);
```

**Also missing in:**
- `setCurrentImageFromHistory()` (line 168)
- Image upload handler (doesn't exist yet)

---

## Solution Required

### Option 1: Add to Imagen Context (Recommended)

**Modify:** `contexts/imagen-context.tsx`

**Add session auto-start to:**
1. `completeGeneration()` - after setting `currentImage`
2. `setCurrentImageFromHistory()` - after setting `currentImage`

**Implementation:**
```typescript
// Add useEffect that watches currentImage
useEffect(() => {
  if (currentImage) {
    // Check if session exists, if not start it
    checkAndStartImageEditingSession();
  }
}, [currentImage]);
```

**Pros:**
- Centralized logic
- Works for all image display methods
- Clean separation of concerns

**Cons:**
- Requires user context (userId) in imagen context

---

### Option 2: Add to Chat Interface

**Modify:** `components/chat/chat-interface.tsx`

**Add session auto-start after:**
1. `completeGeneration()` call (line ~1912)
2. When handling imagen editing tool results (line ~1809)

**Pros:**
- Already has access to `user?.id`
- Can reuse existing auto-start logic

**Cons:**
- Only works for images generated via chat
- Won't work for history selection or uploads

---

### Option 3: Add to API Route

**Modify:** `app/api/imagen/generate/route.ts`

**Add session check/start after image generation succeeds**

**Pros:**
- Server-side, guaranteed to run
- No client-side dependencies

**Cons:**
- Only works for generated images
- Doesn't help with history selection or uploads

---

## Recommended Solution

**Use Option 1 (Imagen Context) + Option 2 (Chat Interface) hybrid:**

1. **Add to Imagen Context:**
   - Create `useEffect` hook that watches `currentImage`
   - When `currentImage` changes from null → image, check for session
   - Auto-start if missing
   - Requires passing `userId` to imagen context (via props or context)

2. **Keep existing auto-start in Chat Interface:**
   - As fallback for when tool calls fail
   - Provides better error recovery

---

## Implementation Checklist

- [ ] Add `userId` access to imagen context (via `useUser()` hook)
- [ ] Add `useEffect` in imagen context to watch `currentImage`
- [ ] Create `checkAndStartImageEditingSession()` function
- [ ] Call it when `currentImage` is set (not null)
- [ ] Test with image generation
- [ ] Test with history selection
- [ ] Test with image upload (when implemented)
- [ ] Ensure session doesn't restart if already active
- [ ] Handle errors gracefully (don't block image display if session start fails)

---

## Additional Issues Found

1. **No image upload functionality** - Need to implement this feature
2. **Session check happens too late** - Only on tool call failure, not proactively
3. **No session status indicator** - User doesn't know if session is active
4. **Cache invalidation timing** - May need to wait longer after session start

---

## Files That Need Changes

1. `contexts/imagen-context.tsx` - Add session auto-start logic
2. `components/chat/chat-interface.tsx` - Keep existing fallback logic
3. `app/api/imagen/upload/route.ts` - Create upload endpoint (new file)
4. `components/imagen/imagen-upload.tsx` - Create upload component (new file)

---

## Testing Plan

1. Generate image → verify session starts automatically
2. Select image from history → verify session starts automatically  
3. Upload image → verify session starts automatically (when implemented)
4. Try editing immediately after generation → should work without delay
5. Verify session doesn't restart if already active
6. Verify error handling if session start fails

