# Image Editing Implementation Plan - ImageSorcery MCP Integration

**Date:** 2025-01-27  
**Status:** Planning  
**Approach:** Pure MCP (using existing infrastructure)

---

## Executive Summary

Integrate ImageSorcery MCP server to provide LLM-driven image editing capabilities for Imagen4-generated images. Uses existing MCP infrastructure for auto-discovery and execution.

**Key Benefits:**
- ✅ Auto-discovery of tools (expert-written descriptions)
- ✅ Leverages existing MCP infrastructure
- ✅ Minimal code changes (~100-200 lines)
- ✅ Consistent with filesystem MCP pattern
- ✅ High LLM accuracy (native tool definitions)

---

## Architecture Overview

### Current State

```
User generates image with Imagen4
    ↓
Image stored in imagen-context
    ↓
User: "Crop this image"
    ↓
LLM calls: imagen_generate (API route) ✅
```

### Target State

```
User generates image with Imagen4
    ↓
Image stored in imagen-context
    ↓
User: "Crop this image"
    ↓
LLM calls: imagen_edit_crop (MCP tool) ✅
    ↓
Route to /api/mcp/call
    ↓
Execute via ImageSorcery MCP server
    ↓
Return edited image
    ↓
Update imagen-context
```

---

## Implementation Phases

### Phase 1: Setup & Discovery (Day 1)

**Goal:** Get ImageSorcery MCP server running and discover tools

#### 1.1 Install ImageSorcery MCP Server

```bash
# Check if Python is available
python3 --version

# Install ImageSorcery MCP
pip install imagesorcery-mcp

# Verify installation
python3 -m imagesorcery_mcp --help
```

**Files to create:**
- `scripts/install-imagesorcery.sh` - Installation script
- `docs/IMAGESORCERY_SETUP.md` - Setup documentation

#### 1.2 Add MCP Server Type Support

**File:** `app/api/mcp/start/route.ts`

**Changes:**
- Add `toolType` parameter to request body
- Support `"filesystem"` (existing) and `"imagesorcery"` (new)
- Spawn ImageSorcery MCP server process

```typescript
// Add to request body validation
const { mode, durationMinutes, toolType = "filesystem" } = body;

// Modify process spawning
let process: ChildProcess;
if (toolType === "filesystem") {
  // Existing filesystem MCP logic
  process = spawn("node", [mcpServerPath, mode]);
} else if (toolType === "imagesorcery") {
  // New: ImageSorcery MCP
  process = spawn("python3", ["-m", "imagesorcery_mcp"]);
} else {
  return NextResponse.json(
    { error: `Unknown tool type: ${toolType}` },
    { status: 400 }
  );
}
```

**Estimated effort:** 2-3 hours

#### 1.3 Test MCP Server Startup

**File:** `__tests__/imagesorcery-mcp.test.ts` (new)

```typescript
describe("ImageSorcery MCP Server", () => {
  it("should start MCP server process", async () => {
    // Test process spawning
  });
  
  it("should discover tools", async () => {
    // Test tool discovery
  });
});
```

**Estimated effort:** 1-2 hours

---

### Phase 2: Tool Discovery Integration (Day 1-2)

**Goal:** Auto-discover ImageSorcery tools and pass to LLM

#### 2.1 Create MCP Tool Discovery Service

**File:** `lib/mcp/tool-discovery.ts` (new)

```typescript
import { MCPClient } from "@modelcontextprotocol/sdk/client";

export interface DiscoveredTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Discover tools from an active MCP server session
 */
export async function discoverMCPTools(
  sessionId: string
): Promise<DiscoveredTool[]> {
  // Get MCP process for session
  const process = await getProcessForSession(sessionId);
  if (!process) {
    throw new Error(`No MCP process found for session ${sessionId}`);
  }
  
  // Send listTools request via stdio
  // Parse response
  // Return tool definitions
}

/**
 * Discover ImageSorcery tools specifically
 */
export async function discoverImageSorceryTools(): Promise<DiscoveredTool[]> {
  // Start temporary ImageSorcery MCP server
  // Discover tools
  // Shutdown server
  // Return tools
}
```

**Estimated effort:** 3-4 hours

#### 2.2 Integrate Tool Discovery in Chat Route

**File:** `app/api/chat/route.ts`

**Changes:**
- Check if ImageSorcery MCP session is active
- Discover tools from session
- Transform to `ToolDefinition` format
- Add to `availableTools` array

```typescript
// Add after existing tool setup
const availableTools: ToolDefinition[] = [];

// Existing tools...
if (hasMCPSession) {
  availableTools.push(...FILE_TOOLS);
}

// NEW: ImageSorcery tools
const hasImageSorcerySession = await checkImageSorcerySession(userId);
if (hasImageSorcerySession) {
  try {
    const imageSorceryTools = await discoverImageSorceryToolsFromSession(userId);
    // Transform MCP tools to ToolDefinition format
    const transformedTools = imageSorceryTools.map(tool => ({
      name: `imagen_edit_${tool.name}`, // Prefix to avoid conflicts
      description: tool.description,
      parameters: {
        type: tool.inputSchema.type,
        properties: transformProperties(tool.inputSchema.properties),
        required: tool.inputSchema.required || []
      }
    }));
    availableTools.push(...transformedTools);
  } catch (error) {
    console.error("[Chat] Failed to discover ImageSorcery tools:", error);
    // Continue without ImageSorcery tools
  }
}
```

**Estimated effort:** 2-3 hours

#### 2.3 Add Image Reference Parameter

**Challenge:** ImageSorcery tools need image data, but we have image IDs

**Solution:** Add `imageId` parameter that gets resolved before calling MCP

**File:** `lib/mcp/image-resolver.ts` (new)

```typescript
import { getImageFromContext } from "@/lib/imagen/storage";

/**
 * Resolve imageId to actual image data for MCP tools
 */
export async function resolveImageForMCP(
  imageId: string,
  userId: string
): Promise<{ data: string; mimeType: string }> {
  // Resolve imageId:
  // - "current" → most recent image
  // - "image_123" → specific image ID
  // - "history[0]" → first in history
  
  const image = await getImageFromContext(imageId, userId);
  return {
    data: image.data, // base64
    mimeType: image.mimeType
  };
}
```

**Estimated effort:** 2-3 hours

---

### Phase 3: Tool Execution (Day 2)

**Goal:** Route image editing tools to MCP server

#### 3.1 Update Tool Handler

**File:** `lib/chat/tool-handler.ts`

**Changes:**
- Add routing for `imagen_edit_*` tools
- Resolve imageId to image data
- Call MCP server with image data
- Return edited image

```typescript
export async function executeToolCall(
  toolCall: ToolCall,
  retryCount: number = 0
): Promise<ToolResult> {
  // Route imagen_edit tools to MCP
  if (toolCall.name.startsWith("imagen_edit_")) {
    return executeImageSorceryToolCall(toolCall);
  }
  
  // Existing routes...
  if (toolCall.name.startsWith("imagen_generate")) {
    return executeImagenToolCall(toolCall);
  }
  // ... etc
}

/**
 * Execute ImageSorcery tool via MCP
 */
async function executeImageSorceryToolCall(
  toolCall: ToolCall
): Promise<ToolResult> {
  try {
    // Extract imageId from arguments
    const { imageId, ...toolArgs } = toolCall.arguments;
    
    // Resolve imageId to image data
    const image = await resolveImageForMCP(imageId, userId);
    
    // Get ImageSorcery MCP session
    const session = await getImageSorcerySession(userId);
    if (!session) {
      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: "No active ImageSorcery MCP session. Please start image editing session first.",
      };
    }
    
    // Prepare MCP tool call
    const mcpToolName = toolCall.name.replace("imagen_edit_", "");
    const mcpArgs = {
      ...toolArgs,
      image: image.data, // base64 image data
      mime_type: image.mimeType
    };
    
    // Call MCP server via /api/mcp/call
    const response = await fetch("/api/mcp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        tool: mcpToolName,
        arguments: mcpArgs
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: error.error || "Image editing failed",
        errorCode: response.status.toString(),
      };
    }
    
    const result = await response.json();
    
    // Extract edited image from result
    const editedImage = result.content?.[0]?.data || result.image;
    
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: {
        success: true,
        image: {
          data: editedImage,
          mimeType: image.mimeType
        }
      }
    };
  } catch (error) {
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

**Estimated effort:** 4-5 hours

#### 3.2 Update MCP Call Route

**File:** `app/api/mcp/call/route.ts`

**Changes:**
- Support multiple MCP server types per session
- Route to correct MCP server based on tool name
- Handle image data in tool calls

```typescript
// Add tool type detection
function detectToolType(toolName: string): "filesystem" | "imagesorcery" {
  if (toolName.startsWith("fs_") || toolName.startsWith("cmd_")) {
    return "filesystem";
  }
  // ImageSorcery tools: crop, resize, find_objects, etc.
  return "imagesorcery";
}

// Modify session lookup to support multiple tool types
// Or create separate sessions per tool type
```

**Estimated effort:** 2-3 hours

---

### Phase 4: Image Storage & Context (Day 2-3)

**Goal:** Store images so they're accessible from MCP tools

#### 4.1 Database Schema

**File:** `prisma/schema.prisma`

**Changes:**
- Add `GeneratedImage` model
- Store images with metadata
- Support edit history

```prisma
model GeneratedImage {
  id              String   @id @default(cuid())
  userId          String
  data            String   @db.Text // base64 encoded
  mimeType        String   @default("image/png")
  prompt          String?
  model           String?
  aspectRatio     String?
  
  // Edit history
  originalImageId String?
  editPrompt      String?
  editType        String?  // "crop", "resize", "blur", etc.
  
  createdAt       DateTime @default(now())
  
  // Relations
  original        GeneratedImage? @relation("ImageEdits", fields: [originalImageId], references: [id])
  edits           GeneratedImage[] @relation("ImageEdits")
  
  @@index([userId])
  @@index([userId, createdAt])
}
```

**Migration:**
```bash
npx prisma migrate dev --name add_generated_image_model
```

**Estimated effort:** 1-2 hours

#### 4.2 Image Storage Service

**File:** `lib/imagen/storage.ts` (new)

```typescript
import { prisma } from "@/lib/prisma";

export async function saveImage(
  userId: string,
  image: {
    data: string;
    mimeType: string;
    prompt?: string;
    model?: string;
    aspectRatio?: string;
  }
): Promise<string> {
  const saved = await prisma.generatedImage.create({
    data: {
      userId,
      ...image
    }
  });
  return saved.id;
}

export async function getImage(
  imageId: string,
  userId: string
): Promise<{
  data: string;
  mimeType: string;
  prompt?: string;
  model?: string;
}> {
  const image = await prisma.generatedImage.findFirst({
    where: {
      id: imageId,
      userId // Security: ensure user owns image
    }
  });
  
  if (!image) {
    throw new Error(`Image not found: ${imageId}`);
  }
  
  return {
    data: image.data,
    mimeType: image.mimeType,
    prompt: image.prompt || undefined,
    model: image.model || undefined
  };
}

export async function resolveImageId(
  imageId: string,
  userId: string
): Promise<string> {
  // Resolve special IDs:
  // - "current" → most recent image
  // - "image_123" → specific ID
  // - "history[0]" → first in history
  
  if (imageId === "current") {
    const recent = await prisma.generatedImage.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    if (!recent) {
      throw new Error("No images found");
    }
    return recent.id;
  }
  
  // Validate ID exists
  const exists = await prisma.generatedImage.findFirst({
    where: { id: imageId, userId },
    select: { id: true }
  });
  
  if (!exists) {
    throw new Error(`Image not found: ${imageId}`);
  }
  
  return imageId;
}
```

**Estimated effort:** 2-3 hours

#### 4.3 Update Imagen Context

**File:** `contexts/imagen-context.tsx`

**Changes:**
- Save images to database on generation
- Load images from database
- Support imageId references

```typescript
const completeGeneration = useCallback(async (image: Omit<GeneratedImage, "id" | "generatedAt">) => {
  // Save to database
  const imageId = await saveImage(userId, image);
  
  const newImage: GeneratedImage = {
    ...image,
    id: imageId,
    generatedAt: Date.now(),
  };
  
  // Update context
  setCurrentImage(newImage);
  // ... rest of logic
}, [userId]);
```

**Estimated effort:** 2-3 hours

---

### Phase 5: UI Integration (Day 3)

**Goal:** Update UI to show edited images and support editing workflow

#### 5.1 Update Chat Interface

**File:** `components/chat/chat-interface.tsx`

**Changes:**
- Handle `imagen_edit_*` tool calls
- Show editing progress
- Update imagen-context with edited image

```typescript
// In tool call handling
if (toolCall.name.startsWith("imagen_edit_")) {
  // Show editing status
  setToolCallStatus(toolCall.id, "Editing image...");
  
  // After completion
  if (result.result?.image) {
    // Save edited image
    const editedImageId = await saveImage(userId, {
      data: result.result.image.data,
      mimeType: result.result.image.mimeType,
      originalImageId: currentImageId,
      editType: toolCall.name.replace("imagen_edit_", ""),
      editPrompt: userMessage
    });
    
    // Update context
    completeGeneration({
      ...result.result.image,
      prompt: currentPrompt,
      model: currentModel
    });
  }
}
```

**Estimated effort:** 2-3 hours

#### 5.2 Add Edit History UI

**File:** `components/imagen/imagen-history.tsx` (new)

```typescript
export function ImagenHistory() {
  const { state } = useImagen();
  const { history } = state;
  
  return (
    <div>
      <h3>Edit History</h3>
      {history.map((image, index) => (
        <div key={image.id}>
          <img src={`data:${image.mimeType};base64,${image.data}`} />
          <p>{image.prompt}</p>
          {image.metadata?.editType && (
            <p>Edit: {image.metadata.editType}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

**Estimated effort:** 2-3 hours

---

### Phase 6: Testing & Polish (Day 4)

**Goal:** Test end-to-end flow and fix issues

#### 6.1 Integration Tests

**File:** `__tests__/imagesorcery-integration.test.ts` (new)

```typescript
describe("ImageSorcery Integration", () => {
  it("should discover tools from MCP server", async () => {
    // Test tool discovery
  });
  
  it("should execute crop tool", async () => {
    // Test image cropping
  });
  
  it("should execute semantic search", async () => {
    // Test find_objects tool
  });
  
  it("should handle image resolution", async () => {
    // Test imageId → image data resolution
  });
});
```

**Estimated effort:** 3-4 hours

#### 6.2 Error Handling

**File:** `lib/mcp/error-handling.ts` (new)

```typescript
export function handleImageSorceryError(error: any): string {
  // Map MCP errors to user-friendly messages
  if (error.code === "IMAGE_NOT_FOUND") {
    return "Image not found. Please generate an image first.";
  }
  if (error.code === "INVALID_PARAMETERS") {
    return "Invalid parameters. Please check your request.";
  }
  // ... etc
  return error.message || "Image editing failed";
}
```

**Estimated effort:** 1-2 hours

#### 6.3 Documentation

**Files:**
- `docs/IMAGE_EDITING.md` - User guide
- `docs/IMAGESORCERY_SETUP.md` - Setup guide
- Update `README.md` with image editing features

**Estimated effort:** 2-3 hours

---

## Implementation Checklist

### Phase 1: Setup
- [ ] Install ImageSorcery MCP server
- [ ] Add `toolType` support to `/api/mcp/start`
- [ ] Test MCP server startup
- [ ] Create installation scripts

### Phase 2: Discovery
- [ ] Create tool discovery service
- [ ] Integrate discovery in chat route
- [ ] Test tool discovery
- [ ] Transform MCP tools to ToolDefinition format

### Phase 3: Execution
- [ ] Update tool handler for `imagen_edit_*` tools
- [ ] Implement image resolution
- [ ] Update MCP call route
- [ ] Test tool execution

### Phase 4: Storage
- [ ] Add database schema
- [ ] Create image storage service
- [ ] Update imagen-context to save images
- [ ] Test image storage/retrieval

### Phase 5: UI
- [ ] Update chat interface for editing
- [ ] Add edit history UI
- [ ] Show editing progress
- [ ] Handle edited images

### Phase 6: Testing
- [ ] Write integration tests
- [ ] Test end-to-end flow
- [ ] Add error handling
- [ ] Write documentation

---

## Timeline

**Total Estimated Time:** 3-4 days

- **Day 1:** Setup & Discovery (6-8 hours)
- **Day 2:** Execution & Storage (8-10 hours)
- **Day 3:** UI Integration (6-8 hours)
- **Day 4:** Testing & Polish (6-8 hours)

---

## Risks & Mitigations

### Risk 1: ImageSorcery MCP Server Not Available
**Mitigation:** Check availability before starting. Fallback to manual tool definitions if needed.

### Risk 2: Image Data Too Large for MCP
**Mitigation:** Use temporary file storage or chunking for large images.

### Risk 3: Process Management Complexity
**Mitigation:** Reuse existing MCP infrastructure. Add health checks and auto-restart.

### Risk 4: Tool Name Conflicts
**Mitigation:** Prefix ImageSorcery tools with `imagen_edit_` to avoid conflicts.

---

## Success Criteria

1. ✅ ImageSorcery MCP server starts successfully
2. ✅ Tools are auto-discovered and passed to LLM
3. ✅ LLM can call image editing tools
4. ✅ Edited images are saved and displayed
5. ✅ Edit history is maintained
6. ✅ End-to-end flow works: Generate → Edit → Display

---

## Next Steps

1. Review and approve plan
2. Install ImageSorcery MCP server
3. Start Phase 1 implementation
4. Test incrementally after each phase
5. Iterate based on feedback

---

## References

- ImageSorcery MCP: https://github.com/sunriseapps/imagesorcery-mcp
- MCP Protocol: https://modelcontextprotocol.io
- Existing MCP Infrastructure: `app/api/mcp/`, `mcp-server/`
- Imagen Context: `contexts/imagen-context.tsx`

