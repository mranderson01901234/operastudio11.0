# Image Editing Streamline Plan

## Problem Analysis

The current image editing implementation is overcomplicated compared to email/GitHub which work seamlessly. Here's why:

### Current Flow (Broken):
```
User: "blur this image"
  ↓
LLM calls: imagen_filter({imageId: "current", filter: "blur"})
  ↓
tool-handler.ts → executeImagenEditToolCall() → executeMCPToolCall()
  ↓
/api/mcp/call → Routes to image-editing MCP server session
  ↓
MCP server → ImageResolver tries to fetch from /api/imagen/resolve/[imageId]
  ↓
ImageResolver needs USER_ID but may not have it properly
  ↓
FAILS with "USER_ID not set" or "Session not found" errors
```

### Email/GitHub Flow (Works):
```
User: "list my emails"
  ↓
LLM calls: email_list()
  ↓
tool-handler.ts → executeEmailToolCall()
  ↓
Direct fetch to /api/email/list
  ↓
SUCCESS - Simple, direct, no MCP layer
```

## Root Causes

1. **Unnecessary MCP Layer**: Image editing doesn't need MCP at all. Email and GitHub prove direct API routes work better.

2. **Complex Session Management**: MCP sessions add complexity, startup delays, and failure points.

3. **Missing Image Context**: When user says "blur this image", the `currentImage.id` from imagen-context isn't passed to the tool call.

4. **Environment Variable Issues**: Even with USER_ID set, the MCP server architecture adds indirection.

## Solution: Direct API Routes (Like Email/GitHub)

### New Streamlined Flow:
```
User: "blur this image"
  ↓
LLM calls: imagen_filter({imageId: "current", filter: "blur"})
  ↓
tool-handler.ts → executeImagenEditToolCall()
  ↓
Direct fetch to /api/imagen/filter (NEW - no MCP)
  ↓
Route reads image from DB using userId (from Clerk auth)
  ↓
Uses Sharp directly to apply filter
  ↓
Stores result in DB
  ↓
Returns success + new image data
  ↓
SUCCESS - Simple, fast, reliable
```

## Implementation Steps

### 1. Create Direct API Routes for Image Editing

Create these new routes (similar to email API):
- `/app/api/imagen/filter/route.ts` - Apply filters
- `/app/api/imagen/crop/route.ts` - Crop image
- `/app/api/imagen/resize/route.ts` - Resize image
- `/app/api/imagen/adjust/route.ts` - Adjust brightness/contrast/etc
- `/app/api/imagen/rotate/route.ts` - Rotate/flip image
- `/app/api/imagen/format/route.ts` - Convert format

Each route:
- Uses Clerk auth (no session management needed)
- Reads image from database
- Uses Sharp library directly
- Stores result back to database
- Returns success + updated image data

### 2. Update Tool Handler

Modify `lib/chat/tool-handler.ts`:

```typescript
async function executeImagenEditToolCall(
  toolCall: ToolCall,
  userId: string
): Promise<ToolResult> {
  // Map tool names to API endpoints (like email tools)
  const endpointMap: Record<string, string> = {
    imagen_filter: "/api/imagen/filter",
    imagen_crop: "/api/imagen/crop",
    imagen_resize: "/api/imagen/resize",
    imagen_adjust: "/api/imagen/adjust",
    imagen_rotate: "/api/imagen/rotate",
    imagen_format: "/api/imagen/format",
  };

  const endpoint = endpointMap[toolCall.name];
  if (!endpoint) {
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: `Unknown image editing tool: ${toolCall.name}`,
    };
  }

  // Call API route directly (no MCP)
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toolCall.arguments),
  });

  // Handle response...
}
```

### 3. Pass Current Image ID to Tool Calls

Modify `contexts/imagen-context.tsx` to expose currentImage.id:

```typescript
// Add to ImagenContextValue
export interface ImagenContextValue {
  // ... existing
  currentImageId: string | null; // NEW
}

// Add to context value
const contextValue = useMemo(() => ({
  // ... existing
  currentImageId: currentImage?.id || null,
}), [/* ... */, currentImage]);
```

Modify `components/chat/chat-interface.tsx` to pass currentImageId:

```typescript
const { currentImageId } = useImagen();

// When calling chat API
await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({
    messages: chatMessages,
    provider: settings.provider,
    selectedTool: state.selectedTool,
    currentImageId, // Pass to API
  }),
});
```

Modify `/app/api/chat/route.ts` to pass currentImageId to LLM context:

Already done - it's in the code! Just ensure it's properly used.

### 4. Remove MCP Dependencies

- **Keep**: `mcp-server-image-editing/` (can be used later if needed)
- **Modify**: Tool handler to NOT route through MCP
- **Remove**: Auto-start MCP session logic from imagen-context (unnecessary)

### 5. Example API Route: `/api/imagen/filter/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageId, filter, intensity = 50 } = await request.json();

  // Resolve imageId
  let image;
  if (imageId === "current") {
    image = await prisma.generatedImage.findFirst({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  } else {
    image = await prisma.generatedImage.findFirst({
      where: { id: imageId, userId },
    });
  }

  if (!image || !image.data) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  try {
    // Apply filter using Sharp
    const inputBuffer = Buffer.from(image.data, "base64");
    let outputBuffer: Buffer;

    switch (filter) {
      case "blur":
        outputBuffer = await sharp(inputBuffer).blur(intensity / 10).toBuffer();
        break;
      case "sharpen":
        outputBuffer = await sharp(inputBuffer).sharpen(intensity / 10).toBuffer();
        break;
      case "grayscale":
        outputBuffer = await sharp(inputBuffer).greyscale().toBuffer();
        break;
      default:
        return NextResponse.json({ error: "Unknown filter" }, { status: 400 });
    }

    // Store edited image
    const editedImage = await prisma.generatedImage.create({
      data: {
        userId,
        data: outputBuffer.toString("base64"),
        mimeType: image.mimeType,
        prompt: image.prompt,
        model: image.model,
        aspectRatio: image.aspectRatio,
        originalImageId: image.id,
        editType: "filter",
        editPrompt: `Applied ${filter} filter with intensity ${intensity}`,
      },
    });

    return NextResponse.json({
      success: true,
      image: {
        id: editedImage.id,
        mimeType: editedImage.mimeType,
        prompt: editedImage.prompt,
      },
    });
  } catch (error) {
    console.error("Image filter error:", error);
    return NextResponse.json(
      { error: "Failed to apply filter" },
      { status: 500 }
    );
  }
}
```

## Benefits of This Approach

1. **✅ Simplicity**: Matches email/GitHub pattern - just API routes
2. **✅ No Session Management**: Uses Clerk auth like everything else
3. **✅ Fast**: No MCP startup delays or indirection
4. **✅ Reliable**: Fewer failure points
5. **✅ Easy to Debug**: Direct API calls, clear error messages
6. **✅ Consistent**: Same pattern as working email/GitHub tools

## Migration Path

1. **Phase 1**: Create API routes (new files)
2. **Phase 2**: Update tool handler to route to API (modify 1 function)
3. **Phase 3**: Remove MCP auto-start from imagen-context (simplify)
4. **Phase 4**: Test and iterate

## Testing Plan

1. Generate image: "generate an image of a black lab puppy"
2. Edit image: "blur this image"
3. Edit again: "make it grayscale"
4. Verify each edit creates new database entry
5. Verify imagen-context updates with new image

## Next Steps

START WITH: Create `/app/api/imagen/filter/route.ts` as a proof of concept.

