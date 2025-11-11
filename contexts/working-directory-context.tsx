"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface WorkingDirectoryContextType {
  currentDirectory: string;
  setCurrentDirectory: (directory: string) => void;
}

const WorkingDirectoryContext = createContext<WorkingDirectoryContextType | undefined>(undefined);

const STORAGE_KEY = "operastudio_working_directory";

export function WorkingDirectoryProvider({ children }: { children: ReactNode }) {
  const [currentDirectory, setCurrentDirectoryState] = useState<string>(() => {
    // Initialize from localStorage or default to home directory
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return stored;
      }
    }
    return "~";
  });

  // Persist to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, currentDirectory);
    }
  }, [currentDirectory]);

  const setCurrentDirectory = (directory: string) => {
    // Normalize the directory path
    let normalized = directory.trim();
    
    // Expand ~ to home directory if needed (for display, actual expansion happens server-side)
    if (normalized.startsWith("~")) {
      normalized = normalized;
    } else if (!normalized.startsWith("/")) {
      // If relative path, make it absolute based on current directory
      if (currentDirectory && currentDirectory !== "~") {
        normalized = `${currentDirectory}/${normalized}`.replace(/\/+/g, "/");
      }
    }
    
    setCurrentDirectoryState(normalized);
  };

  return (
    <WorkingDirectoryContext.Provider value={{ currentDirectory, setCurrentDirectory }}>
      {children}
    </WorkingDirectoryContext.Provider>
  );
}

export function useWorkingDirectory() {
  const context = useContext(WorkingDirectoryContext);
  if (context === undefined) {
    throw new Error("useWorkingDirectory must be used within a WorkingDirectoryProvider");
  }
  return context;
}

