# Architecture Blueprint: Code Editor View with Streaming Edits

**Version:** 1.0  
**Date:** 2025-01-27  
**Status:** Implementation-Ready

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Component Structure](#3-component-structure)
4. [Data Flow & Streaming Protocol](#4-data-flow--streaming-protocol)
5. [State Management](#5-state-management)
6. [UI/UX Patterns](#6-uiux-patterns)
7. [API Contracts](#7-api-contracts)
8. [Implementation Phases](#8-implementation-phases)
9. [Technical Specifications](#9-technical-specifications)
10. [Error Handling & Edge Cases](#10-error-handling--edge-cases)
11. [Performance Considerations](#11-performance-considerations)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Overview

### 1.1 Purpose

This blueprint defines the architecture for implementing a **50/50 split-view code editor** integrated with the chat interface, featuring **hybrid chunk-based streaming** with **diff highlighting** for real-time LLM-initiated file edits.

### 1.2 Key Features

- **Split View Layout**: 50/50 chat (left) and file editor (right)
- **Real-time Streaming**: File edits streamed chunk-by-chunk as LLM generates them
- **Diff Highlighting**: Visual diff overlay showing additions/deletions
- **Multi-file Support**: Tabbed interface for multiple open files
- **Progressive Reveal**: Content appears progressively with visual feedback
- **Conflict Resolution**: Handle user edits during LLM streaming
- **Auto-save**: Optional auto-save with manual override

### 1.3 Design Principles

1. **Real-time Feedback**: Users see edits as they happen
2. **Non-blocking**: Streaming doesn't block chat or other operations
3. **Visual Clarity**: Clear indication of what's streaming vs. complete
4. **Error Recovery**: Graceful handling of partial edits and errors
5. **Performance**: Efficient rendering for large files

---

## 2. System Architecture

### 2.1 Component Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Next.js)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌─────────────────────────┐ │
│  │  Chat Interface  │         │   File Editor View       │ │
│  │   (Left 50%)     │◄────────┤   (Right 50%)           │ │
│  │                  │  Events │                          │ │
│  │  - Messages      │         │  - File Tabs            │ │
│  │  - Input         │         │  - Code Editor           │ │
│  │  - Tool Calls    │         │  - Diff Overlay         │ │
│  └──────────────────┘         │  - Status Bar           │ │
│                                └─────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │         File Editor Context (State Management)        │ │
│  │  - Open files                                         │ │
│  │  - Streaming state                                    │ │
│  │  - File content cache                                │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ SSE Stream
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌─────────────────────────┐ │
│  │  /api/chat       │         │   Gemini Client         │ │
│  │  (Enhanced)      │────────►│   (Function Calling)    │ │
│  │                  │         │                          │ │
│  │  - Text stream   │         │  - Tool definitions     │ │
│  │  - File edit     │         │  - Function execution    │ │
│  │    events        │         │  - Response streaming    │ │
│  └──────────────────┘         └─────────────────────────┘ │
│                                                             │
│  ┌──────────────────┐         ┌─────────────────────────┐ │
│  │  MCP Proxy       │         │   File Edit Streamer    │ │
│  │  /api/mcp/call   │────────►│                          │ │
│  │                  │         │  - Chunk generation     │ │
│  │  - Tool calls    │         │  - Diff calculation     │ │
│  │  - Results       │         │  - Event emission       │ │
│  └──────────────────┘         └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ JSON-RPC
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  - fs.read                                                  │
│  - fs.write                                                 │
│  - fs.list                                                  │
│  - cmd.execute                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

**LLM Edit Flow:**
```
1. User sends message → Chat API
2. Gemini generates tool call (fs_write)
3. Backend intercepts tool call
4. Backend reads original file (if exists)
5. Backend streams file.edit.start event
6. Backend chunks LLM content (100-1000 chars)
7. Backend streams file.edit.chunk events
8. Frontend applies chunks progressively
9. Backend executes actual write
10. Backend streams file.edit.complete event
11. Frontend shows success, enables editing
```

**User Edit Flow:**
```
1. User types in editor
2. File state → modified
3. Auto-save (optional) or manual save
4. MCP write call
5. File state → saved
```

---

## 3. Component Structure

### 3.1 File Tree

```
components/
├── chat/
│   └── chat-interface.tsx          (Enhanced with file events)
├── file-editor/
│   ├── file-editor-view.tsx        (Main container)
│   ├── file-tabs.tsx               (Tab bar)
│   ├── code-editor.tsx             (Monaco editor wrapper)
│   ├── diff-overlay.tsx            (Diff highlighting)
│   ├── streaming-indicator.tsx    (Progress/status)
│   └── file-status-bar.tsx        (Bottom status bar)
├── layout/
│   └── split-view.tsx              (50/50 resizable split)
└── ui/
    └── (existing components)

contexts/
└── file-editor-context.tsx         (File state management)

lib/
├── file-editor/
│   ├── chunk-processor.ts          (Chunk application logic)
│   ├── diff-calculator.ts          (Diff algorithm)
│   └── file-cache.ts               (Content caching)
└── streaming/
    └── event-handler.ts            (SSE event processing)
```

### 3.2 Component Responsibilities

**`SplitView`** (`components/layout/split-view.tsx`)
- Manages 50/50 resizable layout
- Handles drag handle for resizing
- Responsive collapse on small screens
- Minimum width constraints

**`FileEditorView`** (`components/file-editor/file-editor-view.tsx`)
- Container for file editor components
- Manages file tabs state
- Coordinates editor, diff overlay, status bar
- Handles file open/close operations

**`FileTabs`** (`components/file-editor/file-tabs.tsx`)
- Displays open file tabs
- Shows unsaved indicators
- Handles tab switching
- Close button with confirmation

**`CodeEditor`** (`components/file-editor/code-editor.tsx`)
- Monaco Editor wrapper
- Language detection
- Read-only during streaming
- Custom decorations for streaming chunks
- Integration with diff overlay

**`DiffOverlay`** (`components/file-editor/diff-overlay.tsx`)
- Calculates and displays diffs
- Highlights additions (green)
- Highlights deletions (red)
- Shows inline diff view
- Fades out after completion

**`StreamingIndicator`** (`components/file-editor/streaming-indicator.tsx`)
- Progress bar
- Streaming status text
- Chunk count indicator
- Cancel button

**`FileStatusBar`** (`components/file-editor/file-status-bar.tsx`)
- Line/column position
- File encoding
- Language mode
- File size
- Save status

**`FileEditorContext`** (`contexts/file-editor-context.tsx`)
- Global file state
- Open files registry
- Streaming state per file
- File content cache
- Event handlers

---

## 4. Data Flow & Streaming Protocol

### 4.1 SSE Event Types

```typescript
// Base event type
type FileEditEvent =
  | FileEditStart
  | FileEditChunk
  | FileEditComplete
  | FileEditError
  | FileEditCancel;

// Event definitions
interface FileEditStart {
  type: "file.edit.start";
  filePath: string;
  operation: "create" | "edit" | "replace";
  originalContent?: string;  // For diff calculation
  totalSize?: number;         // Estimated bytes
  timestamp: number;
}

interface FileEditChunk {
  type: "file.edit.chunk";
  filePath: string;
  chunk: {
    startOffset: number;      // Character offset
    endOffset: number;
    content: string;
  };
  progress?: number;           // 0-100
  timestamp: number;
}

interface FileEditComplete {
  type: "file.edit.complete";
  filePath: string;
  finalContent: string;
  stats: {
    totalLines: number;
    totalBytes: number;
    duration: number;
    chunksReceived: number;
  };
  timestamp: number;
}

interface FileEditError {
  type: "file.edit.error";
  filePath: string;
  error: string;
  errorCode?: string;
  partialContent?: string;    // Content received before error
  timestamp: number;
}

interface FileEditCancel {
  type: "file.edit.cancel";
  filePath: string;
  reason: "user" | "timeout" | "error";
  timestamp: number;
}
```

### 4.2 Chat API Enhancement

**Enhanced SSE Stream:**
```typescript
// app/api/chat/route.ts

type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool.call"; tool: string; args: Record<string, unknown> }
  | { type: "tool.result"; tool: string; result: unknown }
  | FileEditEvent  // File edit events
  | { type: "metadata"; data: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done" };
```

**Tool Call Interception:**
```typescript
async function handleToolCall(tool: string, args: any) {
  if (tool === "fs_write") {
    const filePath = args.path;
    const newContent = args.content;
    
    // Read original content for diff
    let originalContent = "";
    try {
      const readResult = await mcpCall("fs_read", { path: filePath });
      originalContent = readResult.content || "";
    } catch {
      // File doesn't exist, creating new
    }
    
    // Start streaming
    yield {
      type: "file.edit.start",
      filePath,
      operation: originalContent ? "edit" : "create",
      originalContent,
      totalSize: newContent.length,
      timestamp: Date.now()
    };
    
    // Stream chunks
    const chunkSize = calculateChunkSize(newContent.length);
    let offset = 0;
    let chunkIndex = 0;
    
    while (offset < newContent.length) {
      const chunk = newContent.slice(offset, offset + chunkSize);
      const endOffset = offset + chunk.length;
      
      yield {
        type: "file.edit.chunk",
        filePath,
        chunk: {
          startOffset: offset,
          endOffset,
          content: chunk
        },
        progress: Math.round((endOffset / newContent.length) * 100),
        timestamp: Date.now()
      };
      
      offset = endOffset;
      chunkIndex++;
      
      // Small delay to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Execute actual write
    try {
      const result = await mcpCall("fs_write", args);
      
      yield {
        type: "file.edit.complete",
        filePath,
        finalContent: newContent,
        stats: {
          totalLines: newContent.split('\n').length,
          totalBytes: newContent.length,
          duration: Date.now() - startTime,
          chunksReceived: chunkIndex
        },
        timestamp: Date.now()
      };
    } catch (error) {
      yield {
        type: "file.edit.error",
        filePath,
        error: error.message,
        partialContent: newContent,
        timestamp: Date.now()
      };
    }
  }
}
```

### 4.3 Chunk Size Calculation

```typescript
function calculateChunkSize(totalSize: number): number {
  if (totalSize < 1000) return totalSize;        // Small file: single chunk
  if (totalSize < 10000) return 500;            // Medium: 500 chars
  if (totalSize < 100000) return 1000;          // Large: 1000 chars
  return 2000;                                   // Very large: 2000 chars
}
```

---

## 5. State Management

### 5.1 File Editor Context

```typescript
// contexts/file-editor-context.tsx

interface FileState {
  path: string;
  content: string;
  originalContent: string | null;  // For diff
  language: string;
  isOpen: boolean;
  isActive: boolean;
  isModified: boolean;
  isStreaming: boolean;
  streamingChunks: StreamingChunk[];
  lastSaved: number | null;
  error: string | null;
}

interface StreamingChunk {
  startOffset: number;
  endOffset: number;
  content: string;
  timestamp: number;
  applied: boolean;
}

interface FileEditorState {
  openFiles: Map<string, FileState>;
  activeFile: string | null;
  splitRatio: number;  // 0-1, default 0.5
  isResizing: boolean;
}

interface FileEditorContextValue {
  state: FileEditorState;
  
  // File operations
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => Promise<void>;
  setActiveFile: (path: string) => void;
  saveFile: (path: string) => Promise<void>;
  
  // Streaming operations
  handleFileEditStart: (event: FileEditStart) => void;
  handleFileEditChunk: (event: FileEditChunk) => void;
  handleFileEditComplete: (event: FileEditComplete) => void;
  handleFileEditError: (event: FileEditError) => void;
  
  // Editor operations
  updateFileContent: (path: string, content: string) => void;
  setFileModified: (path: string, modified: boolean) => void;
  
  // Layout operations
  setSplitRatio: (ratio: number) => void;
}
```

### 5.2 State Transitions

```
File Lifecycle:
closed → opening → opened → modified → saving → saved
                              ↓
                         streaming → streaming → complete → saved
                              ↓
                            error → opened (with error)
```

---

## 6. UI/UX Patterns

### 6.1 Visual States

**Idle State:**
```
┌─────────────────────────────────┐
│ [×] index.ts                    │
├─────────────────────────────────┤
│ import React from 'react';       │
│                                 │
│ function App() {                │
│   return <div>Hello</div>;      │
│ }                               │
└─────────────────────────────────┘
```

**Streaming State:**
```
┌─────────────────────────────────┐
│ [×] index.ts ● Streaming...    │
├─────────────────────────────────┤
│ import React from 'react';       │
│                                 │
│ function App() {                │
│   return (                      │
│     <div>                       │ ← Highlighted (pulsing)
│       <h1>Hello</h1>             │ ← Highlighted (pulsing)
│     </div>                      │ ← Highlighted (pulsing)
│   );                            │
│ }                               │
├─────────────────────────────────┤
│ Streaming... 45% │████████░░░░│ │
└─────────────────────────────────┘
```

**Diff State:**
```
┌─────────────────────────────────┐
│ [×] index.ts ● Modified         │
├─────────────────────────────────┤
│ import React from 'react';       │
│                                 │
│ function App() {                │
│   return (                      │
│-    <div>Old</div>              │ ← Red background
│+    <div>                       │ ← Green background
│+      <h1>Hello</h1>             │ ← Green background
│+    </div>                      │ ← Green background
│   );                            │
│ }                               │
└─────────────────────────────────┘
```

### 6.2 Tab Indicators

- **Normal**: `[×] filename.ts`
- **Modified**: `[×] filename.ts •`
- **Streaming**: `[×] filename.ts ●` (animated dot)
- **Error**: `[×] filename.ts ⚠`

### 6.3 Status Bar

```
Ln 42, Col 15 • UTF-8 • Spaces: 2 • TypeScript • 1,234 bytes • Saved
```

**Streaming Status:**
```
Streaming... 45% (chunk 12/27) • TypeScript • 1,234 bytes
```

---

## 7. API Contracts

### 7.1 Enhanced Chat API

**Request:**
```typescript
POST /api/chat
Content-Type: application/json

{
  "messages": Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>,
  "provider": "gemini-flash",
  "includeTools": true  // Enable function calling
}
```

**Response (SSE Stream):**
```
data: {"type":"text","text":"I'll update the file..."}\n\n
data: {"type":"tool.call","tool":"fs_write","args":{"path":"src/index.ts","content":"..."}}\n\n
data: {"type":"file.edit.start","filePath":"src/index.ts","operation":"edit",...}\n\n
data: {"type":"file.edit.chunk","filePath":"src/index.ts","chunk":{...}}\n\n
data: {"type":"file.edit.chunk","filePath":"src/index.ts","chunk":{...}}\n\n
data: {"type":"file.edit.complete","filePath":"src/index.ts",...}\n\n
data: {"type":"text","text":"Done!"}\n\n
data: {"type":"done"}\n\n
```

### 7.2 File Operations API

**Open File:**
```typescript
POST /api/filesystem/open
{
  "path": "src/index.ts"
}

Response:
{
  "content": "...",
  "language": "typescript",
  "size": 1234,
  "mtime": "2025-01-27T12:00:00Z"
}
```

**Save File:**
```typescript
POST /api/filesystem/save
{
  "path": "src/index.ts",
  "content": "..."
}

Response:
{
  "success": true,
  "path": "src/index.ts",
  "size": 1234,
  "mtime": "2025-01-27T12:00:00Z"
}
```

---

## 8. Implementation Phases

### Phase 1: Foundation (Week 1)

**Goals:**
- Set up split view layout
- Integrate Monaco Editor
- Basic file opening/closing
- Tab interface

**Tasks:**
1. Install Monaco Editor: `npm install @monaco-editor/react`
2. Create `SplitView` component with resizable panels
3. Create `FileEditorView` container
4. Create `FileTabs` component
5. Create `CodeEditor` wrapper
6. Create `FileEditorContext` for state management
7. Wire up file tree → editor (click file opens in editor)

**Deliverables:**
- 50/50 split view functional
- Can open files from file tree
- Basic editor with syntax highlighting
- Tab interface working

---

### Phase 2: Streaming Infrastructure (Week 2)

**Goals:**
- Implement SSE event handling
- Chunk processing logic
- Progressive content application

**Tasks:**
1. Enhance `/api/chat` route with file edit events
2. Create `ChunkProcessor` utility
3. Create `FileCache` for content management
4. Implement `handleFileEditStart` in context
5. Implement `handleFileEditChunk` in context
6. Implement `handleFileEditComplete` in context
7. Wire up SSE events to file editor context
8. Add streaming indicator component

**Deliverables:**
- File edits stream in real-time
- Chunks applied progressively
- Streaming indicator shows progress
- Basic error handling

---

### Phase 3: Diff Highlighting (Week 3)

**Goals:**
- Calculate and display diffs
- Visual diff overlay
- Highlight additions/deletions

**Tasks:**
1. Install diff library: `npm install diff`
2. Create `DiffCalculator` utility
3. Create `DiffOverlay` component
4. Integrate diff overlay with Monaco Editor
5. Add diff decorations (green/red highlights)
6. Fade out diff after completion
7. Handle diff for streaming chunks

**Deliverables:**
- Diffs calculated correctly
- Visual highlights for additions/deletions
- Smooth fade-out animation
- Works with streaming chunks

---

### Phase 4: Polish & Edge Cases (Week 4)

**Goals:**
- Error recovery
- Conflict resolution
- Auto-save
- Performance optimization

**Tasks:**
1. Handle partial content on error
2. Implement conflict detection (user edits during streaming)
3. Add auto-save feature (optional)
4. Optimize rendering for large files
5. Add file status bar
6. Add keyboard shortcuts
7. Add undo/redo support
8. Performance testing and optimization

**Deliverables:**
- Robust error handling
- Conflict resolution UI
- Auto-save working
- Smooth performance on large files
- Complete feature set

---

## 9. Technical Specifications

### 9.1 Monaco Editor Configuration

```typescript
const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  theme: "vs-dark",
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  lineNumbers: "on",
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  wordWrap: "on",
  readOnly: false,  // Dynamic based on streaming state
  automaticLayout: true,
  tabSize: 2,
  insertSpaces: true,
  renderWhitespace: "selection",
  bracketPairColorization: { enabled: true },
  suggest: {
    enabled: true
  }
};
```

### 9.2 Diff Algorithm

**Library:** `diff` npm package

**Algorithm:**
```typescript
import { diffLines, diffWords } from 'diff';

function calculateDiff(oldContent: string, newContent: string): DiffResult {
  const changes = diffLines(oldContent, newContent);
  
  return changes.map(change => ({
    type: change.added ? 'add' : change.removed ? 'remove' : 'equal',
    value: change.value,
    lineNumber: calculateLineNumber(changes, change)
  }));
}
```

### 9.3 Chunk Application

```typescript
function applyChunk(
  currentContent: string,
  chunk: { startOffset: number; endOffset: number; content: string }
): string {
  const before = currentContent.slice(0, chunk.startOffset);
  const after = currentContent.slice(chunk.endOffset);
  return before + chunk.content + after;
}
```

### 9.4 Language Detection

```typescript
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'md': 'markdown',
    'json': 'json',
    'css': 'css',
    'html': 'html',
    // ... more mappings
  };
  return languageMap[ext || ''] || 'plaintext';
}
```

---

## 10. Error Handling & Edge Cases

### 10.1 Error Scenarios

**1. Network Interruption During Streaming**
- **Detection**: SSE connection closes unexpectedly
- **Action**: Save partial content, show error banner
- **Recovery**: User can retry or manually edit

**2. Partial Content on Error**
- **Detection**: `file.edit.error` event received
- **Action**: Display partial content with error indicator
- **Recovery**: User can save partial or discard

**3. User Edits During Streaming**
- **Detection**: Editor content changes while `isStreaming === true`
- **Action**: Pause streaming, show conflict dialog
- **Recovery**: User chooses: discard user edits, discard LLM edits, or merge

**4. Large File Streaming**
- **Detection**: File size > 10MB
- **Action**: Use larger chunks, show progress, allow cancellation
- **Recovery**: User can cancel if too slow

**5. Multiple Files Streaming Simultaneously**
- **Detection**: Multiple `file.edit.start` events
- **Action**: Queue edits, show progress per file
- **Recovery**: User can cancel individual streams

### 10.2 Conflict Resolution UI

```typescript
interface ConflictDialog {
  filePath: string;
  userContent: string;
  llmContent: string;
  options: [
    "Keep user edits",
    "Keep LLM edits",
    "Merge (manual)",
    "Cancel"
  ];
}
```

---

## 11. Performance Considerations

### 11.1 Rendering Optimization

**Virtual Scrolling:**
- Monaco Editor handles this internally
- No additional optimization needed

**Chunk Batching:**
- Batch multiple small chunks before applying
- Debounce editor updates (max 60fps)

**Content Caching:**
- Cache file contents in memory
- Invalidate on external changes
- Limit cache size (max 50 files)

### 11.2 Memory Management

**Large Files:**
- Stream in larger chunks (2000+ chars)
- Show warning for files > 10MB
- Offer read-only mode for very large files

**Multiple Files:**
- Limit open files (max 20)
- Unload inactive files from memory
- Keep only active file in editor

### 11.3 Network Optimization

**Chunk Size:**
- Adaptive based on file size
- Larger chunks for large files
- Smaller chunks for small files (better UX)

**Compression:**
- Gzip SSE stream (if supported)
- Compress file content in chunks

---

## 12. Acceptance Criteria

### 12.1 Functional Requirements

✅ **Split View Layout**
- 50/50 split view renders correctly
- Resizable with drag handle
- Minimum widths enforced (300px chat, 400px editor)
- Responsive collapse on small screens

✅ **File Opening**
- Click file in tree opens in editor
- File opens in new tab if not already open
- Active tab highlighted
- File content loads correctly

✅ **Streaming Edits**
- File edits stream chunk-by-chunk
- Content appears progressively
- Progress indicator shows percentage
- Streaming indicator visible during edit

✅ **Diff Highlighting**
- Diffs calculated correctly
- Additions highlighted in green
- Deletions highlighted in red
- Diff fades out after completion

✅ **Multi-file Support**
- Multiple files can be open simultaneously
- Tab switching works correctly
- Each file maintains independent state
- Close button works with confirmation

✅ **Error Handling**
- Network errors handled gracefully
- Partial content saved on error
- Error messages displayed clearly
- User can retry failed operations

✅ **Conflict Resolution**
- User edits during streaming detected
- Conflict dialog shown
- User can choose resolution strategy
- No data loss

### 12.2 Performance Requirements

✅ **Rendering**
- Editor renders smoothly (60fps)
- No lag when applying chunks
- Large files (>10MB) handled efficiently
- Multiple files don't degrade performance

✅ **Memory**
- Memory usage reasonable (<500MB for 20 files)
- No memory leaks
- Inactive files unloaded properly

✅ **Network**
- Chunks stream smoothly
- No excessive network requests
- SSE connection stable

### 12.3 UX Requirements

✅ **Visual Feedback**
- Streaming state clearly indicated
- Progress visible
- Errors clearly communicated
- Success feedback shown

✅ **Accessibility**
- Keyboard shortcuts work
- Screen reader compatible
- Focus management correct
- High contrast mode supported

---

## 13. Dependencies

### 13.1 New Dependencies

```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.6.0",
    "diff": "^5.1.0",
    "monaco-editor": "^0.45.0"
  },
  "devDependencies": {
    "@types/diff": "^5.0.9"
  }
}
```

### 13.2 Existing Dependencies

- React 18+
- Next.js 14+
- TypeScript 5+
- Tailwind CSS
- Lucide React (icons)

---

## 14. Testing Strategy

### 14.1 Unit Tests

- Chunk processor logic
- Diff calculator
- File cache operations
- State transitions

### 14.2 Integration Tests

- File open/close flow
- Streaming edit flow
- Conflict resolution flow
- Error recovery flow

### 14.3 E2E Tests

- User opens file from tree
- LLM edits file, user sees streaming
- User edits during streaming, conflict resolved
- Multiple files open simultaneously

---

## 15. Future Enhancements

### 15.1 Phase 5+ Features

- **LSP Integration**: Language server protocol for IntelliSense
- **Git Integration**: Show git diff, stage changes
- **Search & Replace**: Find/replace across files
- **Code Folding**: Collapse code blocks
- **Minimap**: Enhanced minimap with diff indicators
- **Split Editor**: Split editor view (side-by-side)
- **Zen Mode**: Full-screen editing mode
- **Themes**: Multiple editor themes
- **Extensions**: Plugin system for editor extensions

---

**End of Blueprint**

This blueprint provides a complete, implementation-ready foundation for the code editor view with streaming edits. All components, flows, and specifications are documented and ready for development.

