# Code Editor Implementation Guide

**Quick Reference for Implementation**

This guide provides step-by-step implementation instructions based on the [CODE_EDITOR_BLUEPRINT.md](./CODE_EDITOR_BLUEPRINT.md).

---

## Quick Start Checklist

### Phase 1: Foundation

- [ ] Install dependencies: `npm install @monaco-editor/react monaco-editor diff @types/diff`
- [ ] Create `components/layout/split-view.tsx`
- [ ] Create `components/file-editor/file-editor-view.tsx`
- [ ] Create `components/file-editor/file-tabs.tsx`
- [ ] Create `components/file-editor/code-editor.tsx`
- [ ] Create `contexts/file-editor-context.tsx`
- [ ] Wire up file tree click → open file in editor
- [ ] Test: Click file in tree, opens in editor

### Phase 2: Streaming

- [ ] Enhance `app/api/chat/route.ts` with file edit events
- [ ] Create `lib/file-editor/chunk-processor.ts`
- [ ] Create `lib/file-editor/file-cache.ts`
- [ ] Add SSE event handlers to `FileEditorContext`
- [ ] Create `components/file-editor/streaming-indicator.tsx`
- [ ] Test: LLM edits file, see streaming in editor

### Phase 3: Diff Highlighting

- [ ] Create `lib/file-editor/diff-calculator.ts`
- [ ] Create `components/file-editor/diff-overlay.tsx`
- [ ] Integrate diff overlay with Monaco Editor
- [ ] Add diff decorations (green/red highlights)
- [ ] Test: See diff highlights during streaming

### Phase 4: Polish

- [ ] Add error handling
- [ ] Implement conflict resolution
- [ ] Add auto-save feature
- [ ] Create `components/file-editor/file-status-bar.tsx`
- [ ] Add keyboard shortcuts
- [ ] Performance optimization

---

## Key Code Snippets

### 1. Split View Component

```typescript
// components/layout/split-view.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface SplitViewProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultRatio?: number;
  minLeft?: number;
  minRight?: number;
}

export function SplitView({ 
  left, 
  right, 
  defaultRatio = 0.5,
  minLeft = 300,
  minRight = 400 
}: SplitViewProps) {
  const [ratio, setRatio] = useState(defaultRatio);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = () => setIsResizing(true);
  
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRatio = (e.clientX - rect.left) / rect.width;
      const clampedRatio = Math.max(
        minLeft / rect.width,
        Math.min(1 - minRight / rect.width, newRatio)
      );
      setRatio(clampedRatio);
    };

    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, minLeft, minRight]);

  return (
    <div ref={containerRef} className="flex h-full w-full">
      <div style={{ width: `${ratio * 100}%` }} className="flex-shrink-0">
        {left}
      </div>
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "w-1 cursor-col-resize bg-border hover:bg-primary/20 transition-colors",
          isResizing && "bg-primary/40"
        )}
      />
      <div style={{ width: `${(1 - ratio) * 100}%` }} className="flex-shrink-0">
        {right}
      </div>
    </div>
  );
}
```

### 2. File Editor Context

```typescript
// contexts/file-editor-context.tsx
"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface FileState {
  path: string;
  content: string;
  originalContent: string | null;
  language: string;
  isOpen: boolean;
  isActive: boolean;
  isModified: boolean;
  isStreaming: boolean;
  streamingChunks: Array<{
    startOffset: number;
    endOffset: number;
    content: string;
    timestamp: number;
  }>;
  error: string | null;
}

interface FileEditorContextValue {
  openFiles: Map<string, FileState>;
  activeFile: string | null;
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  handleFileEditStart: (event: any) => void;
  handleFileEditChunk: (event: any) => void;
  handleFileEditComplete: (event: any) => void;
}

const FileEditorContext = createContext<FileEditorContextValue | null>(null);

export function FileEditorProvider({ children }: { children: React.ReactNode }) {
  const [openFiles, setOpenFiles] = useState<Map<string, FileState>>(new Map());
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const openFile = useCallback(async (path: string) => {
    // Load file content
    const response = await fetch(`/api/filesystem/read?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    
    setOpenFiles(prev => {
      const next = new Map(prev);
      next.set(path, {
        path,
        content: data.content,
        originalContent: data.content,
        language: detectLanguage(path),
        isOpen: true,
        isActive: true,
        isModified: false,
        isStreaming: false,
        streamingChunks: [],
        error: null
      });
      return next;
    });
    
    setActiveFile(path);
  }, []);

  const handleFileEditStart = useCallback((event: any) => {
    const { filePath, originalContent } = event;
    
    setOpenFiles(prev => {
      const next = new Map(prev);
      const existing = next.get(filePath);
      
      if (existing) {
        next.set(filePath, {
          ...existing,
          isStreaming: true,
          originalContent: originalContent || existing.content,
          streamingChunks: []
        });
      } else {
        // Open new file
        next.set(filePath, {
          path: filePath,
          content: "",
          originalContent: originalContent || "",
          language: detectLanguage(filePath),
          isOpen: true,
          isActive: true,
          isModified: false,
          isStreaming: true,
          streamingChunks: [],
          error: null
        });
        setActiveFile(filePath);
      }
      
      return next;
    });
  }, []);

  const handleFileEditChunk = useCallback((event: any) => {
    const { filePath, chunk } = event;
    
    setOpenFiles(prev => {
      const next = new Map(prev);
      const file = next.get(filePath);
      if (!file) return prev;
      
      // Apply chunk
      const before = file.content.slice(0, chunk.startOffset);
      const after = file.content.slice(chunk.endOffset);
      const newContent = before + chunk.content + after;
      
      next.set(filePath, {
        ...file,
        content: newContent,
        streamingChunks: [
          ...file.streamingChunks,
          { ...chunk, timestamp: Date.now() }
        ]
      });
      
      return next;
    });
  }, []);

  const handleFileEditComplete = useCallback((event: any) => {
    const { filePath, finalContent } = event;
    
    setOpenFiles(prev => {
      const next = new Map(prev);
      const file = next.get(filePath);
      if (!file) return prev;
      
      next.set(filePath, {
        ...file,
        content: finalContent,
        isStreaming: false,
        streamingChunks: []
      });
      
      return next;
    });
  }, []);

  return (
    <FileEditorContext.Provider value={{
      openFiles,
      activeFile,
      openFile,
      closeFile: (path) => {
        setOpenFiles(prev => {
          const next = new Map(prev);
          next.delete(path);
          return next;
        });
        if (activeFile === path) {
          setActiveFile(null);
        }
      },
      setActiveFile,
      handleFileEditStart,
      handleFileEditChunk,
      handleFileEditComplete
    }}>
      {children}
    </FileEditorContext.Provider>
  );
}

export function useFileEditor() {
  const context = useContext(FileEditorContext);
  if (!context) {
    throw new Error("useFileEditor must be used within FileEditorProvider");
  }
  return context;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'md': 'markdown',
    'json': 'json',
    'css': 'css',
    'html': 'html'
  };
  return map[ext || ''] || 'plaintext';
}
```

### 3. Enhanced Chat API

```typescript
// app/api/chat/route.ts (additions)

// In the streamChat function, intercept tool calls:

for await (const chunk of stream) {
  // Handle function calls from Gemini
  if (chunk.functionCalls) {
    for (const call of chunk.functionCalls) {
      if (call.name === "fs_write") {
        // Stream file edit events
        yield* streamFileEdit(call.args.path, call.args.content);
        
        // Execute actual write
        const result = await mcpCall("fs_write", call.args);
        yield { type: "tool.result", tool: "fs_write", result };
      }
    }
  }
  
  // Continue with text streaming...
}

async function* streamFileEdit(filePath: string, content: string) {
  // Read original for diff
  let originalContent = "";
  try {
    const readResult = await mcpCall("fs_read", { path: filePath });
    originalContent = readResult.content || "";
  } catch {}
  
  // Start event
  yield {
    type: "file.edit.start",
    filePath,
    operation: originalContent ? "edit" : "create",
    originalContent,
    totalSize: content.length,
    timestamp: Date.now()
  };
  
  // Stream chunks
  const chunkSize = calculateChunkSize(content.length);
  let offset = 0;
  
  while (offset < content.length) {
    const chunk = content.slice(offset, offset + chunkSize);
    yield {
      type: "file.edit.chunk",
      filePath,
      chunk: {
        startOffset: offset,
        endOffset: offset + chunk.length,
        content: chunk
      },
      progress: Math.round(((offset + chunk.length) / content.length) * 100),
      timestamp: Date.now()
    };
    offset += chunk.length;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  // Complete event
  yield {
    type: "file.edit.complete",
    filePath,
    finalContent: content,
    stats: {
      totalLines: content.split('\n').length,
      totalBytes: content.length,
      duration: Date.now() - startTime,
      chunksReceived: Math.ceil(content.length / chunkSize)
    },
    timestamp: Date.now()
  };
}
```

### 4. Chat Interface Integration

```typescript
// components/chat/chat-interface.tsx (additions)

import { useFileEditor } from "@/contexts/file-editor-context";

export function ChatInterface() {
  const { handleFileEditStart, handleFileEditChunk, handleFileEditComplete } = useFileEditor();
  
  // In sendMessage function, handle SSE events:
  
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case "file.edit.start":
      handleFileEditStart(data);
      break;
    case "file.edit.chunk":
      handleFileEditChunk(data);
      break;
    case "file.edit.complete":
      handleFileEditComplete(data);
      break;
    // ... other cases
  }
}
```

---

## Testing Checklist

### Unit Tests
- [ ] Chunk processor applies chunks correctly
- [ ] Diff calculator computes diffs accurately
- [ ] File cache manages content properly
- [ ] Language detection works for all extensions

### Integration Tests
- [ ] File opens from tree click
- [ ] Streaming edits apply correctly
- [ ] Multiple files can be open
- [ ] Tab switching works

### E2E Tests
- [ ] User opens file → editor shows content
- [ ] LLM edits file → user sees streaming
- [ ] User edits during streaming → conflict dialog
- [ ] Error during streaming → partial content saved

---

## Common Issues & Solutions

### Issue: Monaco Editor not loading
**Solution:** Ensure `monaco-editor` is installed and webpack config is correct

### Issue: Chunks not applying correctly
**Solution:** Check offset calculations, ensure chunks are applied in order

### Issue: Diff highlights not showing
**Solution:** Verify Monaco decorations API usage, check diff calculation

### Issue: Performance issues with large files
**Solution:** Increase chunk size, implement virtual scrolling, limit open files

---

## Next Steps

1. Review [CODE_EDITOR_BLUEPRINT.md](./CODE_EDITOR_BLUEPRINT.md) for complete specifications
2. Start with Phase 1 (Foundation)
3. Test each phase before moving to next
4. Refer to blueprint for detailed API contracts and state management

---

**Good luck with implementation! 🚀**

