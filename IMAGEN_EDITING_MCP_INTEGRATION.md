# ImageSorcery Integration: MCP Server vs API Routes

## Current Architecture Patterns

Your codebase uses **two different patterns** for tools:

### Pattern 1: MCP Server (Filesystem)
- Spawns a process (`mcp-server/`)
- Communicates via stdio (JSON-RPC)
- Managed via `/api/mcp/start` and `/api/mcp/call`
- Example: `fs_read`, `fs_write`, `fs_list`

### Pattern 2: API Routes (Imagen, Email, GitHub)
- Direct HTTP calls to API routes
- No separate process to manage
- Simpler integration
- Example: `imagen_generate` → `/api/imagen/generate`

---

## ImageSorcery Integration Options

### Option A: External MCP Server (Like Filesystem) ⚠️ More Complex

**How it works:**
1. ImageSorcery runs as a separate MCP server process
2. You spawn/manage the process (like filesystem MCP)
3. Communicate via stdio JSON-RPC
4. Route tools through `/api/mcp/call` or create `/api/imagesorcery/call`

**Pros:**
- ✅ Uses ImageSorcery as-is (no wrapping needed)
- ✅ Follows MCP protocol standard
- ✅ Can leverage ImageSorcery's full feature set

**Cons:**
- ❌ More complex (process management, stdio communication)
- ❌ Need to handle process lifecycle (start/stop/health checks)
- ❌ ImageSorcery is Python-based (may need Python runtime)
- ❌ More moving parts to debug

**Implementation:**
```typescript
// app/api/imagesorcery/start/route.ts
export async function POST(request: NextRequest) {
  // Spawn ImageSorcery MCP server process
  const process = spawn("python", ["-m", "imagesorcery_mcp"], {
    stdio: ["pipe", "pipe", "pipe"]
  });
  
  // Initialize MCP connection
  // Store process in session
  // Return session info
}

// app/api/imagesorcery/call/route.ts
export async function POST(request: NextRequest) {
  // Get ImageSorcery process for session
  // Send JSON-RPC request via stdio
  // Return response
}
```

---

### Option B: API Routes Wrapper (Like Imagen Generate) ⭐ RECOMMENDED

**How it works:**
1. Create API routes that wrap ImageSorcery functionality
2. Call ImageSorcery's Python API from Node.js (via subprocess or HTTP if available)
3. Route tools through existing tool handler pattern
4. No separate MCP server process to manage

**Pros:**
- ✅ **Simpler** - Follows your existing `imagen_generate` pattern
- ✅ **Consistent** - Same architecture as email/GitHub tools
- ✅ **Easier to debug** - Standard HTTP requests/responses
- ✅ **No process management** - No need to spawn/manage processes
- ✅ **Faster to implement** - Can start with basic operations

**Cons:**
- ⚠️ Need to wrap ImageSorcery's functionality
- ⚠️ May need to call Python from Node.js (subprocess or HTTP)

**Implementation:**
```typescript
// app/api/imagen/crop/route.ts
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  const { imageId, x, y, width, height } = await request.json();
  
  // Get image from context
  const image = await getImageFromContext(imageId);
  
  // Call ImageSorcery via Python subprocess
  // OR use ImageSorcery's HTTP API if available
  const result = await execAsync(
    `python -m imagesorcery crop --input - --x ${x} --y ${y} --width ${width} --height ${height}`,
    { input: Buffer.from(image.data, 'base64') }
  );
  
  return NextResponse.json({
    success: true,
    image: { data: result.stdout, mimeType: image.mimeType }
  });
}
```

**Or better - if ImageSorcery has HTTP API:**
```typescript
// app/api/imagen/crop/route.ts
export async function POST(request: NextRequest) {
  const { imageId, x, y, width, height } = await request.json();
  const image = await getImageFromContext(imageId);
  
  // Call ImageSorcery HTTP API (if available)
  const response = await fetch("http://localhost:8000/api/crop", {
    method: "POST",
    body: JSON.stringify({
      image: image.data,
      x, y, width, height
    })
  });
  
  const result = await response.json();
  return NextResponse.json({ success: true, image: result });
}
```

---

### Option C: Hybrid - Use ImageSorcery MCP Tools Directly

**How it works:**
1. ImageSorcery runs as external MCP server (user starts it)
2. Your app connects to it (like connecting to any MCP server)
3. Tools are automatically available via MCP protocol
4. No process management needed (user manages it)

**Pros:**
- ✅ No process management in your app
- ✅ Uses ImageSorcery as-is
- ✅ User controls when it runs

**Cons:**
- ❌ Requires user to set up ImageSorcery separately
- ❌ Less integrated experience
- ❌ Need MCP client connection logic

---

## Recommendation: Option B (API Routes)

**Why:**
1. **Consistency** - Matches your `imagen_generate` pattern
2. **Simplicity** - No process management complexity
3. **Control** - You control the API surface
4. **Flexibility** - Can mix Sharp + ImageSorcery features

**Implementation Strategy:**

### Phase 1: Start with Sharp (Quick Win)
- Implement basic operations via API routes using Sharp
- Fast, no external dependencies
- Get core editing working quickly

### Phase 2: Add ImageSorcery Features (When Needed)
- For semantic search (`imagen_find_objects`) - use ImageSorcery
- For background removal - use ImageSorcery
- For OCR - use ImageSorcery
- Wrap these as API routes

**Example Structure:**
```
app/api/imagen/
├── generate/route.ts          # Imagen4 generation (exists)
├── crop/route.ts              # Sharp (basic)
├── resize/route.ts            # Sharp (basic)
├── adjust/route.ts            # Sharp (basic)
├── find-objects/route.ts      # ImageSorcery (semantic search)
├── remove-background/route.ts # ImageSorcery (background removal)
└── extract-text/route.ts      # ImageSorcery (OCR)
```

---

## Tool Handler Integration

Either way, tools route through your existing handler:

```typescript
// lib/chat/tool-handler.ts
export async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  // Route imagen tools
  if (toolCall.name.startsWith("imagen_")) {
    // Option A: Call MCP server
    if (toolCall.name.startsWith("imagen_edit_")) {
      return executeImageSorceryMCPCall(toolCall);
    }
    // Option B: Call API routes (recommended)
    return executeImagenEditToolCall(toolCall);
  }
  
  // ... existing routes
}

// Option B implementation (recommended)
async function executeImagenEditToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const endpointMap = {
    "imagen_crop": "/api/imagen/crop",
    "imagen_resize": "/api/imagen/resize",
    "imagen_find_objects": "/api/imagen/find-objects", // ImageSorcery
    "imagen_remove_background": "/api/imagen/remove-background", // ImageSorcery
    // ... etc
  };
  
  const endpoint = endpointMap[toolCall.name];
  const response = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(toolCall.arguments)
  });
  
  return { /* ... */ };
}
```

---

## Decision Matrix

| Factor | MCP Server | API Routes |
|--------|-----------|------------|
| **Complexity** | High | Low |
| **Consistency** | Different pattern | Matches imagen_generate |
| **Process Management** | Required | Not needed |
| **Debugging** | Harder (stdio) | Easier (HTTP) |
| **Implementation Time** | 3-5 days | 1-2 days |
| **Maintenance** | Higher | Lower |

---

## Final Recommendation

**Use API Routes (Option B)** - Same pattern as `imagen_generate`:
1. ✅ Consistent with existing architecture
2. ✅ Simpler to implement and maintain
3. ✅ Easier to debug
4. ✅ Can start with Sharp, add ImageSorcery features incrementally

**Only use MCP Server (Option A) if:**
- ImageSorcery requires MCP protocol specifically
- You want to leverage ImageSorcery's full MCP feature set
- You're okay with the added complexity

For most use cases, **API Routes is the better choice**.

