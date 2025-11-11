"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/nextjs";

export type ToolType = "chat" | "filesystem" | "email" | "github" | null;

export type SessionStatus = "disconnected" | "selecting-mode" | "starting" | "connected" | "error";
export type SecurityMode = "SAFE" | "BALANCED" | "UNRESTRICTED";

export interface FileSystemContextValue {
  selectedTool: ToolType;
  setSelectedTool: (tool: ToolType) => void;
  sessionStatus: SessionStatus;
  securityMode: SecurityMode | null;
  error: string | null;
  cwd: string; // Current working directory (absolute path, default: ~)
  selection: string | null; // Currently selected file (absolute path, or null)
  setCwd: (path: string) => void;
  setSelection: (path: string | null) => void;
  startMCPSession: (mode: SecurityMode, durationMinutes?: number) => Promise<void>;
  stopMCPSession: () => Promise<void>;
  clearError: () => void;
}

const FileSystemContext = createContext<FileSystemContextValue | null>(null);

export function FileSystemProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [selectedTool, setSelectedTool] = useState<ToolType>("chat");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("disconnected");
  const [securityMode, setSecurityMode] = useState<SecurityMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Track if we've verified session exists to prevent false disconnections
  const hasVerifiedSessionRef = useRef(false);
  // File system state as per blueprint (section 8.1)
  // Default to ~ (home directory), API will resolve it
  const [cwd, setCwd] = useState<string>("~");
  const [selection, setSelection] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const startMCPSession = useCallback(async (mode: SecurityMode, durationMinutes?: number) => {
    if (!user) {
      setError("Please sign in first");
      return;
    }

    setSessionStatus("starting");
    setError(null);
    setSecurityMode(mode);

    try {
      console.log(`🚀 Starting MCP server with mode: ${mode}`);
      
      const response = await fetch("/api/mcp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, durationMinutes }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to start MCP server: ${response.status}`);
      }

      const data = await response.json();
      console.log("✅ MCP server started:", data);
      
      hasVerifiedSessionRef.current = true;
      setSessionStatus("connected");
    } catch (err) {
      console.error("❌ Failed to start MCP server:", err);
      setError(err instanceof Error ? err.message : "Failed to start MCP server");
      setSessionStatus("error");
      setSecurityMode(null);
    }
  }, [user]);

  const stopMCPSession = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      const response = await fetch("/api/mcp/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to stop MCP server");
      }

      hasVerifiedSessionRef.current = false;
      setSessionStatus("disconnected");
      setSecurityMode(null);
    } catch (err) {
      console.error("Failed to stop MCP server:", err);
      setError(err instanceof Error ? err.message : "Failed to stop MCP server");
    }
  }, [user]);


  // Show mode selector when File System is selected (only on initial selection, not when session dies)
  useEffect(() => {
    if (selectedTool !== "filesystem" || !isLoaded || !user) {
      return;
    }

    // Check if we already have an active session
    const checkSession = async () => {
      try {
        const response = await fetch("/api/sessions/status", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.hasActiveSession) {
            // Already connected - preserve this state
            hasVerifiedSessionRef.current = true;
            setSessionStatus("connected");
            setSecurityMode(data.mode as SecurityMode || null);
            return;
          }
        }

        // No active session - only show mode selector if we're explicitly in disconnected state
        // AND we're not already in a transitional state (starting, selecting-mode, error)
        // This prevents showing the selector when switching views if session is still active
        if (sessionStatus === "disconnected" || sessionStatus === null) {
          // Only show selector if we're truly disconnected
          // Don't show if we're in any other state (connected, starting, selecting-mode, error)
          setSessionStatus("selecting-mode");
        }
      } catch (err) {
        console.error("Failed to check session status:", err);
      }
    };

    void checkSession();
  }, [selectedTool, isLoaded, user]); // Removed sessionStatus from dependencies to prevent re-triggering

  // Poll session status when File System is selected OR when user is authenticated
  // This ensures we know session status even when in chat mode
  useEffect(() => {
    if (!isLoaded || !user) {
      return;
    }

    let pollInterval: NodeJS.Timeout | null = null;
    let isPolling = false;

    const checkSessionStatus = async () => {
      if (isPolling) return; // Prevent concurrent polls
      isPolling = true;

      try {
        const response = await fetch("/api/sessions/status", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        // Handle non-ok responses gracefully (404, 500, etc.)
        if (!response.ok) {
          // For 404, treat as no active session (route might not exist or server issue)
          if (response.status === 404) {
            console.debug("Session status endpoint not found (404), treating as no active session");
            // Only mark as disconnected if we previously verified a session existed
            if (hasVerifiedSessionRef.current) {
              setSessionStatus((prev) => {
                if (prev === "connected") {
                  hasVerifiedSessionRef.current = false;
                  return "disconnected";
                }
                return prev;
              });
            }
            return;
          }
          // For other errors, log but don't throw - treat as no active session
          console.warn(`Session status check returned ${response.status}, treating as no active session`);
          return;
        }

        const data = await response.json();

        if (data.hasActiveSession) {
          hasVerifiedSessionRef.current = true;
          setSessionStatus((prev) => {
            // Update to connected and preserve security mode
            if (prev !== "connected") {
              setSecurityMode(data.mode as SecurityMode || null);
              return "connected";
            }
            // If already connected, still update security mode in case it changed
            if (data.mode) {
              setSecurityMode(data.mode as SecurityMode || null);
            }
            return prev;
          });
        } else {
          // Session ended or not started
          // Only mark as disconnected if we previously verified a session existed
          // This prevents false disconnections from temporary network issues
          if (hasVerifiedSessionRef.current) {
            setSessionStatus((prev) => {
              // Only change from connected to disconnected if we're absolutely sure
              if (prev === "connected") {
                hasVerifiedSessionRef.current = false;
                return "disconnected";
              }
              return prev;
            });
          }
          // If we never verified a session existed, don't change state
        }
      } catch (err) {
        // Only log if it's not a network error (server might be starting)
        if (err instanceof TypeError && err.message === "Failed to fetch") {
          // Server not ready yet, silently ignore
          console.debug("Session status check: server not ready yet");
        } else {
          console.error("Failed to check session status:", err);
        }
        // Don't update status on error, just log it
      } finally {
        isPolling = false;
      }
    };

    // Check immediately
    void checkSessionStatus();

    // Poll more frequently when File System is selected, less frequently in chat mode
    const pollIntervalMs = selectedTool === "filesystem" ? 2000 : 10000; // 2s for filesystem, 10s for chat
    
    pollInterval = setInterval(() => {
      void checkSessionStatus();
    }, pollIntervalMs);

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [selectedTool, isLoaded, user]);

  const value: FileSystemContextValue = {
    selectedTool,
    setSelectedTool,
    sessionStatus,
    securityMode,
    error,
    cwd,
    selection,
    setCwd,
    setSelection,
    startMCPSession,
    stopMCPSession,
    clearError,
  };

  return (
    <FileSystemContext.Provider value={value}>
      {children}
    </FileSystemContext.Provider>
  );
}

export function useFileSystem() {
  const context = useContext(FileSystemContext);
  if (!context) {
    throw new Error("useFileSystem must be used within FileSystemProvider");
  }
  return context;
}

