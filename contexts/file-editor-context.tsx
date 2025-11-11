"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from "react";
import { useUser } from "@clerk/nextjs";

export interface PendingEdit {
  proposedContent: string;
  description: string;
  timestamp: number;
  source: "llm" | "manual";
  acceptedBlocks?: Set<string>; // IDs of accepted change blocks
  rejectedBlocks?: Set<string>; // IDs of rejected change blocks
}

export interface FileState {
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
  lastSaved: number | null;
  error: string | null;
  pendingEdit: PendingEdit | null;
}

interface FileEditorState {
  openFiles: Map<string, FileState>;
  activeFile: string | null;
  splitRatio: number;
  isResizing: boolean;
}

interface FileEditorContextValue {
  state: FileEditorState;
  openFile: (path: string, content?: string, language?: string) => Promise<void>;
  closeFile: (path: string) => void;
  closeAllFiles: () => void;
  setActiveFile: (path: string) => void;
  saveFile: (path: string) => Promise<void>;
  handleFileEditStart: (event: {
    filePath: string;
    operation: "create" | "edit" | "replace";
    originalContent?: string;
    totalSize?: number;
    timestamp: number;
  }) => void;
  handleFileEditChunk: (event: {
    filePath: string;
    chunk: {
      startOffset: number;
      endOffset: number;
      content: string;
    };
    progress?: number;
    timestamp: number;
  }) => void;
  handleFileEditComplete: (event: {
    filePath: string;
    finalContent: string;
    description?: string;
    stats: {
      totalLines: number;
      totalBytes: number;
      duration: number;
      chunksReceived: number;
    };
    timestamp: number;
  }) => void;
  handleFileEditError: (event: {
    filePath: string;
    error: string;
    errorCode?: string;
    partialContent?: string;
    timestamp: number;
  }) => void;
  updateFileContent: (path: string, content: string) => void;
  setFileModified: (path: string, modified: boolean) => void;
  setSplitRatio: (ratio: number) => void;
  acceptPendingEdit: (filePath: string) => Promise<void>;
  rejectPendingEdit: (filePath: string) => void;
  acceptChangeBlock: (filePath: string, blockId: string) => void;
  rejectChangeBlock: (filePath: string, blockId: string) => void;
  acceptAllChanges: (filePath: string) => Promise<void>;
}

const FileEditorContext = createContext<FileEditorContextValue | null>(null);

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    md: "markdown",
    json: "json",
    css: "css",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    php: "php",
    rb: "ruby",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    r: "r",
    lua: "lua",
    pl: "perl",
    vue: "vue",
    svelte: "svelte",
  };
  return languageMap[ext || ""] || "plaintext";
}

export function FileEditorProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  const [openFiles, setOpenFiles] = useState<Map<string, FileState>>(new Map());
  const [activeFile, setActiveFileState] = useState<string | null>(null);
  const [splitRatio, setSplitRatioState] = useState(0.5);
  const [isResizing, setIsResizing] = useState(false);

  const openFile = useCallback(async (path: string, providedContent?: string, providedLanguage?: string) => {
    // Check if file is already open
    if (openFiles.has(path)) {
      setActiveFileState(path);
      return;
    }

    try {
      let content = providedContent;
      let language = providedLanguage;

      // If content is not provided, fetch it from the API
      if (content === undefined) {
        // Check if it's a GitHub file path (github://owner/repo/path)
        if (path.startsWith("github://")) {
          // GitHub files should have content provided, but if not, we can't fetch them here
          throw new Error("GitHub files must provide content when opening");
        }

        // Load file content from filesystem API
        const response = await fetch(
          `/api/filesystem/read?path=${encodeURIComponent(path)}`
        );
        
        if (!response.ok) {
          // Try to parse error details from JSON response
          let errorMessage = `Failed to read file: ${response.statusText}`;
          try {
            const errorData = await response.json();
            if (errorData.details) {
              errorMessage = errorData.details;
            } else if (errorData.error) {
              errorMessage = `${errorData.error}${errorData.details ? `: ${errorData.details}` : ''}`;
            }
          } catch {
            // If JSON parsing fails, use statusText
            errorMessage = `Failed to read file: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        content = data.content || "";
      }

      // Detect language if not provided
      if (!language) {
        language = detectLanguage(path);
      }
      
      setOpenFiles((prev) => {
        const next = new Map(prev);
        // Set all other files to inactive
        next.forEach((file) => {
          file.isActive = false;
        });
        
        next.set(path, {
          path,
          content: content || "",
          originalContent: content || "",
          language: language || "plaintext",
          isOpen: true,
          isActive: true,
          isModified: false,
          isStreaming: false,
          streamingChunks: [],
          lastSaved: null,
          error: null,
          pendingEdit: null,
        });
        return next;
      });

      setActiveFileState(path);
    } catch (error) {
      console.error("Error opening file:", error);
      // Set error state
      setOpenFiles((prev) => {
        const next = new Map(prev);
        const existing = next.get(path);
        if (existing) {
          next.set(path, {
            ...existing,
            error: error instanceof Error ? error.message : "Failed to open file",
          });
        } else {
          // Create a file entry with error state
          next.set(path, {
            path,
            content: "",
            originalContent: "",
            language: providedLanguage || detectLanguage(path),
            isOpen: true,
            isActive: true,
            isModified: false,
            isStreaming: false,
            streamingChunks: [],
            lastSaved: null,
            error: error instanceof Error ? error.message : "Failed to open file",
            pendingEdit: null,
          });
        }
        return next;
      });
      setActiveFileState(path);
    }
  }, [openFiles]);

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });

    if (activeFile === path) {
      // Set another file as active, or null if none
      const remainingFiles = Array.from(openFiles.keys()).filter((p) => p !== path);
      setActiveFileState(remainingFiles.length > 0 ? remainingFiles[0] : null);
    }
  }, [activeFile, openFiles]);

  const closeAllFiles = useCallback(() => {
    setOpenFiles(new Map());
    setActiveFileState(null);
  }, []);

  const setActiveFile = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const next = new Map(prev);
      next.forEach((file) => {
        file.isActive = file.path === path;
      });
      return next;
    });
    setActiveFileState(path);
  }, []);

  const saveFile = useCallback(async (path: string) => {
    const file = openFiles.get(path);
    if (!file) return;

    try {
      const response = await fetch("/api/filesystem/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: file.path,
          content: file.content,
        }),
      });

      if (!response.ok) {
        // Try to parse error details from JSON response
        let errorMessage = `Failed to save file: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.details) {
            errorMessage = errorData.details;
          } else if (errorData.error) {
            errorMessage = `${errorData.error}${errorData.details ? `: ${errorData.details}` : ''}`;
          }
        } catch {
          // If JSON parsing fails, use statusText
          errorMessage = `Failed to save file: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      setOpenFiles((prev) => {
        const next = new Map(prev);
        const existing = next.get(path);
        if (existing) {
          next.set(path, {
            ...existing,
            isModified: false,
            originalContent: existing.content,
            lastSaved: Date.now(),
          });
        }
        return next;
      });
    } catch (error) {
      console.error("Error saving file:", error);
      setOpenFiles((prev) => {
        const next = new Map(prev);
        const existing = next.get(path);
        if (existing) {
          next.set(path, {
            ...existing,
            error: error instanceof Error ? error.message : "Failed to save file",
          });
        }
        return next;
      });
    }
  }, [openFiles]);

  const handleFileEditStart = useCallback((event: {
    filePath: string;
    operation: "create" | "edit" | "replace";
    originalContent?: string;
    totalSize?: number;
    timestamp: number;
  }) => {
    const { filePath, originalContent } = event;

    setOpenFiles((prev) => {
      const next = new Map(prev);
      const existing = next.get(filePath);

      if (existing) {
        next.set(filePath, {
          ...existing,
          isStreaming: true,
          originalContent: originalContent || existing.content,
          streamingChunks: [],
          error: null,
        });
        // Set as active
        next.forEach((f) => {
          f.isActive = f.path === filePath;
        });
        setActiveFileState(filePath);
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
          lastSaved: null,
          error: null,
          pendingEdit: null,
        });
        // Set all other files to inactive
        next.forEach((f) => {
          if (f.path !== filePath) {
            f.isActive = false;
          }
        });
        setActiveFileState(filePath);
      }

      return next;
    });
  }, []);

  const handleFileEditChunk = useCallback((event: {
    filePath: string;
    chunk: {
      startOffset: number;
      endOffset: number;
      content: string;
    };
    progress?: number;
    timestamp: number;
  }) => {
    const { filePath, chunk } = event;

    setOpenFiles((prev) => {
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
          { ...chunk, timestamp: Date.now() },
        ],
      });

      return next;
    });
  }, []);

  const handleFileEditComplete = useCallback((event: {
    filePath: string;
    finalContent: string;
    description?: string;
    stats: {
      totalLines: number;
      totalBytes: number;
      duration: number;
      chunksReceived: number;
    };
    timestamp: number;
  }) => {
    const { filePath, finalContent, description } = event;

    setOpenFiles((prev) => {
      const next = new Map(prev);
      const file = next.get(filePath);
      
      // If file doesn't exist, create it (shouldn't happen if handleFileEditStart was called first, but handle it anyway)
      if (!file) {
        // Create file state with pending edit
        next.set(filePath, {
          path: filePath,
          content: "", // Will be set from proposedContent when displayed
          originalContent: "", // Unknown, will be empty
          language: detectLanguage(filePath),
          isOpen: true,
          isActive: true, // Set as active so it shows in editor
          isModified: false,
          isStreaming: false,
          streamingChunks: [],
          lastSaved: null,
          error: null,
          pendingEdit: {
            proposedContent: finalContent,
            description: description || "File edited by LLM",
            timestamp: event.timestamp,
            source: "llm",
            acceptedBlocks: new Set<string>(),
            rejectedBlocks: new Set<string>(),
          },
        });
        
        // Set all other files to inactive
        next.forEach((f) => {
          if (f.path !== filePath) {
            f.isActive = false;
          }
        });
        
        // Set as active file
        setActiveFileState(filePath);
        
        return next;
      }

      // File exists, store as pending edit
      const originalContent = file.originalContent || file.content;
      
      // Set this file as active
      next.forEach((f) => {
        f.isActive = f.path === filePath;
      });
      
      next.set(filePath, {
        ...file,
        content: originalContent, // Keep original content
        isStreaming: false,
        streamingChunks: [],
        isModified: false,
        isActive: true, // Ensure it's active
        pendingEdit: {
          proposedContent: finalContent,
          description: description || "File edited by LLM",
          timestamp: event.timestamp,
          source: "llm",
          acceptedBlocks: new Set<string>(),
          rejectedBlocks: new Set<string>(),
        },
      });
      
      // Set as active file
      setActiveFileState(filePath);

      return next;
    });
  }, []);

  const handleFileEditError = useCallback((event: {
    filePath: string;
    error: string;
    errorCode?: string;
    partialContent?: string;
    timestamp: number;
  }) => {
    const { filePath, error, partialContent } = event;

    setOpenFiles((prev) => {
      const next = new Map(prev);
      const file = next.get(filePath);
      if (!file) return prev;

      next.set(filePath, {
        ...file,
        isStreaming: false,
        error,
        content: partialContent || file.content,
      });

      return next;
    });
  }, []);

  const updateFileContent = useCallback((path: string, content: string) => {
    setOpenFiles((prev) => {
      const next = new Map(prev);
      const file = next.get(path);
      if (!file) return prev;

      next.set(path, {
        ...file,
        content,
        isModified: file.originalContent !== content,
      });

      return next;
    });
  }, []);

  const setFileModified = useCallback((path: string, modified: boolean) => {
    setOpenFiles((prev) => {
      const next = new Map(prev);
      const file = next.get(path);
      if (!file) return prev;

      next.set(path, {
        ...file,
        isModified: modified,
      });

      return next;
    });
  }, []);

  const setSplitRatio = useCallback((ratio: number) => {
    setSplitRatioState(ratio);
  }, []);

  const acceptPendingEdit = useCallback(async (filePath: string) => {
    const file = openFiles.get(filePath);
    if (!file || !file.pendingEdit) return;

    // Apply the pending edit
    setOpenFiles((prev) => {
      const next = new Map(prev);
      const currentFile = next.get(filePath);
      if (!currentFile || !currentFile.pendingEdit) return prev;

      next.set(filePath, {
        ...currentFile,
        content: currentFile.pendingEdit.proposedContent,
        originalContent: currentFile.pendingEdit.proposedContent,
        isModified: false,
        pendingEdit: null,
      });

      return next;
    });

    // Save to disk
    await saveFile(filePath);
  }, [openFiles, saveFile]);

  const rejectPendingEdit = useCallback((filePath: string) => {
    setOpenFiles((prev) => {
      const next = new Map(prev);
      const file = next.get(filePath);
      if (!file) return prev;

      next.set(filePath, {
        ...file,
        pendingEdit: null,
      });

      return next;
    });
  }, []);

  const acceptChangeBlock = useCallback((filePath: string, blockId: string) => {
    setOpenFiles((prev) => {
      const next = new Map(prev);
      const file = next.get(filePath);
      if (!file || !file.pendingEdit) return prev;

      const acceptedBlocks = new Set(file.pendingEdit.acceptedBlocks || []);
      const rejectedBlocks = new Set(file.pendingEdit.rejectedBlocks || []);
      
      acceptedBlocks.add(blockId);
      rejectedBlocks.delete(blockId);

      next.set(filePath, {
        ...file,
        pendingEdit: {
          ...file.pendingEdit,
          acceptedBlocks,
          rejectedBlocks,
        },
      });

      return next;
    });
  }, []);

  const rejectChangeBlock = useCallback((filePath: string, blockId: string) => {
    setOpenFiles((prev) => {
      const next = new Map(prev);
      const file = next.get(filePath);
      if (!file || !file.pendingEdit) return prev;

      const acceptedBlocks = new Set(file.pendingEdit.acceptedBlocks || []);
      const rejectedBlocks = new Set(file.pendingEdit.rejectedBlocks || []);
      
      rejectedBlocks.add(blockId);
      acceptedBlocks.delete(blockId);

      next.set(filePath, {
        ...file,
        pendingEdit: {
          ...file.pendingEdit,
          acceptedBlocks,
          rejectedBlocks,
        },
      });

      return next;
    });
  }, []);

  const acceptAllChanges = useCallback(async (filePath: string) => {
    await acceptPendingEdit(filePath);
  }, [acceptPendingEdit]);

  // Memoize state object to prevent re-renders when state values haven't changed
  const state = useMemo(() => ({
    openFiles,
    activeFile,
    splitRatio,
    isResizing,
  }), [openFiles, activeFile, splitRatio, isResizing]);

  // Memoize the entire context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    state,
    openFile,
    closeFile,
    closeAllFiles,
    setActiveFile,
    saveFile,
    handleFileEditStart,
    handleFileEditChunk,
    handleFileEditComplete,
    handleFileEditError,
    updateFileContent,
    setFileModified,
    setSplitRatio,
    acceptPendingEdit,
    rejectPendingEdit,
    acceptChangeBlock,
    rejectChangeBlock,
    acceptAllChanges,
  }), [
    state,
    openFile,
    closeFile,
    closeAllFiles,
    setActiveFile,
    saveFile,
    handleFileEditStart,
    handleFileEditChunk,
    handleFileEditComplete,
    handleFileEditError,
    updateFileContent,
    setFileModified,
    setSplitRatio,
    acceptPendingEdit,
    rejectPendingEdit,
    acceptChangeBlock,
    rejectChangeBlock,
    acceptAllChanges,
  ]);

  // Reset all file editor state when user signs out
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setOpenFiles(new Map());
      setActiveFileState(null);
      setSplitRatioState(0.5);
      setIsResizing(false);
    }
  }, [isSignedIn, isLoaded]);

  return (
    <FileEditorContext.Provider value={contextValue}>
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

