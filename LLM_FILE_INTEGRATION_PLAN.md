# LLM File Integration - Unified Implementation Plan

## Overview
This plan covers **both** file context awareness and tool calling integration as a unified system. The LLM will:
1. **Know** what files are open (file context awareness)
2. **Be able to edit** those files via tools (tool calling integration)

## Current State Analysis

### What Exists
✅ **MCP Server** (`mcp-server/`)
- Tools: `fs_read`, `fs_write`, `fs_list`, `cmd_execute`
- Security modes: Safe, Balanced, Unrestricted
- JSON-RPC protocol over stdio

✅ **MCP Proxy API** (`/api/mcp/call`)
- Can manually call MCP tools
- Requires active MCP session
- Returns tool results

✅ **File Editor Context** (`contexts/file-editor-context.tsx`)
- Tracks open files: `Map<string, FileState>`
- Tracks active file
- Manages file content, modifications, streaming

✅ **Chat Interface** (`components/chat/chat-interface.tsx`)
- Sends messages to `/api/chat`
- Receives streaming responses
- No file awareness yet

✅ **Gemini Client** (`lib/clients/gemini.ts`)
- Formats messages for Gemini API
- Supports system messages
- **NO function calling/tool use yet**

### What's Missing
❌ **LLM Tool Calling Integration**
- Gemini API supports function calling, but not implemented
- No tool definitions passed to Gemini
- No tool call detection/handling in response

❌ **File Context Awareness**
- Chat doesn't know about open files
- No automatic file context injection

❌ **Unified File Editing Flow**
- LLM can't automatically edit files
- No connection between LLM responses and file editor

## Architecture Design

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Opens File                          │
│              (Monaco Editor)                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              FileEditorContext Updates                       │
│         - File added to openFiles Map                        │
│         - activeFile set                                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              User Sends Chat Message                         │
│         "review this file and fix errors"                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         ChatInterface: sendMessage()                         │
│  1. Collect file context from FileEditorContext              │
│  2. Build system message with file contents                 │
│  3. Build tool definitions (fs_read, fs_write, etc.)        │
│  4. Send to /api/chat with context + tools                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              /api/chat Route                                 │
│  1. Receives messages + file context + tools                 │
│  2. Formats for Gemini with function calling enabled         │
│  3. Streams response                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         Gemini API Response                                  │
│  - Text chunks                                               │
│  - Function calls (fs_write, fs_read, etc.)                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         Tool Call Handler                                    │
│  1. Detect function calls in stream                          │
│  2. Execute via /api/mcp/call                                │
│  3. Stream results back to LLM                               │
│  4. Update FileEditorContext if file edited                  │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: File Context Collection & Injection
**Goal:** LLM knows what files are open

**Files to Modify:**
- `components/chat/chat-interface.tsx`

**Implementation:**
1. Import `useFileEditor` hook
2. Create `buildFileContextMessage()` function
3. Inject as system message before user message
4. Include file paths, languages, and contents

**File Context Format:**
```typescript
interface FileContext {
  path: string;
  language: string;
  content: string;
  isActive: boolean;
  isModified: boolean;
}

function buildFileContextMessage(
  openFiles: Map<string, FileState>,
  activeFile: string | null
): string {
  if (openFiles.size === 0) return "";
  
  const parts = [
    "The user has the following files open in the editor:",
    ""
  ];
  
  openFiles.forEach((file) => {
    const isActive = file.path === activeFile;
    parts.push(`File: ${file.path}${isActive ? " (currently active)" : ""}`);
    parts.push(`Language: ${file.language}`);
    parts.push(`Content:\n\`\`\`${file.language}\n${file.content}\n\`\`\``);
    parts.push("");
  });
  
  if (activeFile) {
    parts.push(`The user is currently viewing: ${activeFile}`);
    parts.push("");
  }
  
  parts.push("When the user refers to 'this file', 'the file', 'the current file',");
  parts.push("or similar, they are referring to the active file.");
  parts.push("When they refer to 'these files' or 'all files', they mean all open files.");
  
  return parts.join("\n");
}
```

### Phase 2: Tool Definitions & Gemini Function Calling
**Goal:** Enable Gemini to call tools

**Files to Modify:**
- `lib/clients/gemini.ts` - Add tool definitions and function calling config
- `app/api/chat/route.ts` - Pass tools to Gemini client

**Gemini Function Calling Schema:**
```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      required?: boolean;
    }>;
    required: string[];
  };
}

const FILE_TOOLS: ToolDefinition[] = [
  {
    name: "fs_read",
    description: "Read the contents of a file. Use this to read files that are not currently open in the editor, or to get the latest version of a file.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to read"
        },
        maxBytes: {
          type: "number",
          description: "Maximum bytes to read (default: 10MB)"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "fs_write",
    description: "Write content to a file. This will create the file if it doesn't exist, or overwrite it if it does. When editing files that are open in the editor, this will update the editor view automatically.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to write"
        },
        content: {
          type: "string",
          description: "Complete file content to write"
        },
        create: {
          type: "boolean",
          description: "Create file if it doesn't exist (default: true)"
        }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "fs_list",
    description: "List files and directories in a given path. Use this to explore the file system.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list"
        },
        depth: {
          type: "number",
          description: "Maximum depth to recurse (default: 1)"
        },
        includeHidden: {
          type: "boolean",
          description: "Include hidden files (default: false)"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "cmd_execute",
    description: "Execute a shell command. Use this to run commands like git, npm, build tools, etc. Only available in Balanced or Unrestricted security modes.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Command to execute (e.g., 'git', 'npm', 'ls')"
        },
        args: {
          type: "array",
          description: "Command arguments as array of strings"
        },
        cwd: {
          type: "string",
          description: "Working directory (default: current directory)"
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000)"
        }
      },
      required: ["command"]
    }
  }
];
```

**Gemini API Integration:**
```typescript
// In lib/clients/gemini.ts

export async function* streamChat({
  messages,
  tools, // NEW: Tool definitions
  signal,
}: {
  messages: GeminiMessage[];
  tools?: ToolDefinition[]; // NEW
  signal?: AbortSignal;
}): AsyncGenerator<GeminiStreamChunk> {
  const client = getClient();
  const { history, latestUserText } = formatMessagesForGemini(messages);

  // ... existing code ...

  const config = {
    ...createRequestConfig(signal),
    ...(tools && tools.length > 0 ? {
      tools: [{
        functionDeclarations: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }))
      }]
    } : {})
  };

  // Use generateContentStream with tools
  const stream = await client.models.generateContentStream({
    model: MODEL,
    contents: promptContents,
    config: config,
  });

  // ... rest of streaming logic ...
}
```

### Phase 3: Tool Call Detection & Handling
**Goal:** Detect and execute tool calls from Gemini responses

**Files to Create:**
- `lib/chat/tool-handler.ts` - Tool call detection and execution

**Files to Modify:**
- `app/api/chat/route.ts` - Handle tool calls in stream
- `components/chat/chat-interface.tsx` - Handle tool call events

**Tool Call Detection:**
```typescript
// lib/chat/tool-handler.ts

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  result: unknown;
  error?: string;
}

export function detectToolCalls(response: GenerateContentResponse): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  
  // Gemini returns function calls in candidates[].content.parts[]
  const candidates = response.candidates || [];
  
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name, // Use name as ID, or generate UUID
          name: part.functionCall.name,
          arguments: part.functionCall.args || {}
        });
      }
    }
  }
  
  return toolCalls;
}

export async function executeToolCall(
  toolCall: ToolCall,
  sessionId: string
): Promise<ToolResult> {
  try {
    // Call MCP proxy API
    const response = await fetch("/api/mcp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: toolCall.name,
        arguments: toolCall.arguments
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: error.error || "Tool execution failed"
      };
    }

    const result = await response.json();
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: result
    };
  } catch (error) {
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
```

**Stream Processing:**
```typescript
// In lib/clients/gemini.ts - modify streamChat()

export async function* streamChat({
  messages,
  tools,
  signal,
  onToolCall, // NEW: Callback for tool calls
}: {
  messages: GeminiMessage[];
  tools?: ToolDefinition[];
  signal?: AbortSignal;
  onToolCall?: (toolCall: ToolCall) => void; // NEW
}): AsyncGenerator<GeminiStreamChunk> {
  // ... existing setup ...

  for await (const chunk of stream) {
    // Detect tool calls in chunk
    if (chunk.functionCalls && onToolCall) {
      for (const funcCall of chunk.functionCalls) {
        onToolCall({
          id: funcCall.name, // or generate UUID
          name: funcCall.name,
          arguments: funcCall.args || {}
        });
      }
    }

    // ... existing text streaming logic ...
  }
}
```

### Phase 4: File Editor Integration
**Goal:** Update editor when LLM edits files

**Files to Modify:**
- `components/chat/chat-interface.tsx` - Handle tool results
- `contexts/file-editor-context.tsx` - Add method to update file from tool result

**Tool Result Handling:**
```typescript
// In components/chat/chat-interface.tsx

const handleToolResult = async (toolCall: ToolCall, result: ToolResult) => {
  // If fs_write succeeded, update file editor
  if (toolCall.name === "fs_write" && !result.error) {
    const filePath = toolCall.arguments.path as string;
    const content = toolCall.arguments.content as string;
    
    // Check if file is open
    const { state, updateFileContent, openFile } = useFileEditor();
    
    if (state.openFiles.has(filePath)) {
      // File is open, update it
      updateFileContent(filePath, content);
    } else {
      // File not open, open it
      await openFile(filePath);
    }
  }
  
  // Emit tool result event for UI feedback
  // Could show toast: "File updated: /path/to/file.ts"
};
```

### Phase 5: Streaming Tool Calls
**Goal:** Handle tool calls during streaming (not just at end)

**Approach:**
- Gemini can return function calls mid-stream
- Need to pause text streaming, execute tool, resume
- Or execute tools in parallel and inject results

**Implementation Strategy:**
```typescript
// Option A: Sequential (simpler)
1. LLM generates text → stream to user
2. LLM requests tool call → pause streaming
3. Execute tool → get result
4. Send result back to LLM → resume streaming

// Option B: Parallel (better UX)
1. LLM generates text → stream to user
2. LLM requests tool call → continue streaming text
3. Execute tool in background
4. When tool completes → inject result into next LLM turn
```

**Recommended: Option A (Sequential)**
- Simpler to implement
- Clearer conversation flow
- LLM sees tool result before continuing

## File Organization

### New Files
```
lib/
  chat/
    tool-handler.ts          # Tool call detection & execution
    tool-definitions.ts      # Tool schema definitions
  clients/
    gemini.ts               # MODIFY: Add function calling support
components/
  chat/
    chat-interface.tsx      # MODIFY: Add file context + tool handling
app/
  api/
    chat/
      route.ts              # MODIFY: Handle tool calls in stream
```

### Modified Files
- `components/chat/chat-interface.tsx` - File context + tool handling
- `lib/clients/gemini.ts` - Function calling support
- `app/api/chat/route.ts` - Tool call processing
- `contexts/file-editor-context.tsx` - File update from tools

## Implementation Order

### Step 1: File Context Awareness (Phase 1)
- ✅ Simple, no dependencies
- ✅ Immediate value to user
- ✅ Foundation for tool calling

### Step 2: Tool Definitions (Phase 2)
- ✅ Define tool schemas
- ✅ Pass to Gemini API
- ✅ Test tool definitions are accepted

### Step 3: Tool Call Detection (Phase 3)
- ✅ Detect function calls in responses
- ✅ Log tool calls (don't execute yet)
- ✅ Verify detection works

### Step 4: Tool Execution (Phase 3)
- ✅ Execute tools via MCP API
- ✅ Return results to LLM
- ✅ Test full flow

### Step 5: File Editor Integration (Phase 4)
- ✅ Update editor when files edited
- ✅ Open files if not already open
- ✅ Visual feedback

### Step 6: Streaming Tool Calls (Phase 5)
- ✅ Handle tool calls during streaming
- ✅ Pause/resume logic
- ✅ Error handling

## Security Considerations

### Tool Execution Security
- ✅ MCP security modes already enforce restrictions
- ✅ Safe mode: read-only
- ✅ Balanced: limited writes
- ✅ Unrestricted: full access (time-limited)

### File Context Security
- ✅ Only include files user explicitly opened
- ✅ Don't auto-include sensitive files
- ✅ User controls what's visible

### Token Limits
- ✅ Limit file context size (~100KB total)
- ✅ Truncate large files
- ✅ Exclude files if too many

## Testing Scenarios

### File Context Awareness
1. ✅ No files open → no context sent
2. ✅ Single file open → context includes file
3. ✅ Multiple files → all included, active file marked
4. ✅ Large files → truncated appropriately

### Tool Calling
1. ✅ LLM calls `fs_read` → file read successfully
2. ✅ LLM calls `fs_write` → file written, editor updates
3. ✅ LLM calls `fs_list` → directory listed
4. ✅ LLM calls `cmd_execute` → command runs (if mode allows)
5. ✅ Tool call fails → error returned to LLM
6. ✅ Multiple tool calls → all executed

### Integration
1. ✅ User opens file → LLM knows about it
2. ✅ User asks "fix errors" → LLM reads file, fixes, writes back
3. ✅ Editor updates automatically
4. ✅ User sees changes immediately

## Success Criteria

✅ User can open files and LLM automatically knows about them
✅ User can reference files implicitly ("this file", "the current file")
✅ LLM can read files via `fs_read` tool
✅ LLM can write files via `fs_write` tool
✅ Editor updates automatically when LLM edits files
✅ Tool calls work in Safe/Balanced/Unrestricted modes
✅ Error handling works correctly
✅ Token limits respected

## Future Enhancements

1. **Smart File Selection**: Only include relevant files based on user query
2. **Diff Context**: Show what changed since last message
3. **Selection Context**: Include selected code ranges
4. **Project Context**: Include related files from project structure
5. **Git Integration**: Include git status, diffs
6. **LSP Integration**: Include language server diagnostics
7. **Multi-turn Tool Calls**: LLM can chain multiple tool calls
8. **Tool Call Streaming**: Stream large tool results incrementally

