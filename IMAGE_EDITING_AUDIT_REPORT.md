# Image Editing Capabilities Audit Report

## Issue Identified

When prompting the LLM to "blur this image" or similar image editing requests, the LLM responds that it "cannot directly apply filters or modifications like blurring to an image that has already been generated or viewed." This is incorrect - the LLM has access to image editing tools and should use them.

## Root Causes

1. **Unclear Tool Descriptions**: Tool descriptions didn't explicitly state that phrases like "blur this image" should trigger the use of `imagen_filter` with `imageId: 'current'`.

2. **Vague Context Message**: The context message in `app/api/chat/route.ts` referenced non-existent tool names (`imagen_edit_*`) instead of the actual tool names (`imagen_filter`, `imagen_crop`, etc.).

3. **Missing Explicit Instructions**: The LLM wasn't explicitly told that it CAN and MUST use editing tools when requested, leading it to believe it cannot edit images.

4. **Insufficient Examples**: The context message lacked concrete examples showing exactly how to handle common requests like "blur this image".

## Fixes Applied

### 1. Enhanced Tool Descriptions (`lib/chat/imagen-edit-tool-definitions.ts`)

**Before:**
```typescript
description: "Apply visual filters or effects to an image. Use this when the user wants to change the style or add effects like blur, sharpen, grayscale, etc."
```

**After:**
```typescript
description: "Apply visual filters or effects to an image. Use this when the user wants to change the style or add effects like blur, sharpen, grayscale, etc. IMPORTANT: When the user says 'blur this image', 'blur the image', 'blur it', 'apply blur', or similar phrases referring to the currently displayed image, you MUST use this tool with imageId: 'current' and filter: 'blur'. The 'current' imageId refers to the image currently displayed in the Image Generation view (50/50 split view)."
```

**Changes:**
- Added explicit instructions for common phrases ("blur this image", "blur the image", "blur it")
- Clarified that `imageId: 'current'` refers to the image in the 50/50 split view
- Made it clear that the tool MUST be used when these phrases are detected
- Enhanced parameter descriptions to emphasize using 'current' for displayed images

### 2. Improved Context Message (`app/api/chat/route.ts`)

**Before:**
```typescript
parts.push("To edit this image, use the imagen_edit_* tools with imageId: 'current'.");
parts.push("Available image editing tools:");
parts.push("- imagen_filter: Apply filters (blur, sharpen, grayscale, etc.)");
```

**After:**
```typescript
parts.push("WHEN THE USER SAYS:");
parts.push("- 'blur this image' → Use imagen_filter with imageId: 'current', filter: 'blur'");
parts.push("- 'blur the image' → Use imagen_filter with imageId: 'current', filter: 'blur'");
parts.push("- 'blur it' → Use imagen_filter with imageId: 'current', filter: 'blur'");
// ... more examples
parts.push("");
parts.push("IMPORTANT RULES:");
parts.push("1. ALWAYS use imageId: 'current' when the user refers to the displayed image");
parts.push("2. The 'current' imageId automatically resolves to the image shown in the 50/50 split view");
parts.push("3. You CAN directly edit images - do NOT say you cannot apply filters or modifications");
parts.push("4. When the user asks to blur/edit/modify 'this image', they mean the displayed image");
parts.push("");
parts.push("DO NOT say you cannot edit images. You have these tools available and MUST use them when requested.");
```

**Changes:**
- Fixed incorrect tool name references (`imagen_edit_*` → actual tool names)
- Added explicit mapping of user phrases to tool calls
- Added clear rules stating the LLM CAN edit images
- Included concrete examples with exact tool call syntax
- Explicitly instructed the LLM NOT to say it cannot edit images

### 3. Enhanced All Tool Descriptions

Updated all image editing tools (`imagen_crop`, `imagen_resize`, `imagen_adjust`, `imagen_rotate`, `imagen_format`) with:
- Explicit instructions for common user phrases
- Clear guidance to use `imageId: 'current'` for displayed images
- Emphasis on the 50/50 split view context

## Verification

✅ **Tool Registration**: Tools are correctly registered when `hasImageEditingSession` is true (line 289-290 in `route.ts`)

✅ **Context Passing**: `currentImageId` is correctly passed from chat interface to API route (line 2105-2116 in `chat-interface.tsx`)

✅ **Context Message**: Enhanced context message is built when `currentImageId` exists (lines 91-122 in `route.ts`)

✅ **Tool Availability**: Tools are added to `availableTools` array and passed to LLM (line 290 in `route.ts`)

## Expected Behavior After Fixes

When a user says "blur this image" while an image is displayed in the 50/50 view:

1. **LLM receives context** indicating there's a current image with ID
2. **LLM sees explicit instructions** mapping "blur this image" → `imagen_filter({imageId: 'current', filter: 'blur'})`
3. **LLM understands** it CAN and MUST use the tool (not say it cannot)
4. **LLM calls the tool** with correct parameters
5. **Image is edited** and displayed in the view

## Testing Recommendations

1. **Test Common Phrases**:
   - "blur this image" → Should call `imagen_filter` with `imageId: 'current'`, `filter: 'blur'`
   - "blur the image" → Should call `imagen_filter` with `imageId: 'current'`, `filter: 'blur'`
   - "blur it" → Should call `imagen_filter` with `imageId: 'current'`, `filter: 'blur'`
   - "crop this" → Should call `imagen_crop` with `imageId: 'current'`
   - "brighten this" → Should call `imagen_adjust` with `imageId: 'current'`, `brightness: > 1.0`

2. **Verify LLM Response**:
   - Should NOT say "I cannot directly apply filters"
   - Should call the appropriate tool
   - Should use `imageId: 'current'` for displayed images

3. **Check Tool Execution**:
   - Verify tool calls are routed correctly to MCP server
   - Verify edited images are stored and displayed
   - Verify image context updates after editing

## Additional Notes

- The image editing tools require an active `image-editing` MCP session (`hasImageEditingSession`)
- The `currentImageId` is passed from the frontend (`imagen-context.tsx`) to the chat interface
- The context message is only added when `currentImageId` exists, ensuring the LLM knows about the displayed image
- All tool descriptions now explicitly reference the 50/50 split view to clarify which image is "current"

## Files Modified

1. `lib/chat/imagen-edit-tool-definitions.ts` - Enhanced all tool descriptions
2. `app/api/chat/route.ts` - Improved context message with explicit instructions

