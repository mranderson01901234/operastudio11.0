"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export interface DownloadProgress {
  id: string;
  fileName: string;
  url: string;
  progress: number; // 0-100
  downloadedBytes: number;
  totalBytes: number | null;
  speed: number; // bytes per second
  status: "downloading" | "completed" | "error" | "cancelled";
  error?: string;
  startTime: number;
  estimatedTimeRemaining: number | null; // seconds
}

interface DownloadContextType {
  downloads: Map<string, DownloadProgress>;
  addDownload: (id: string, fileName: string, url: string) => void;
  updateDownload: (id: string, updates: Partial<DownloadProgress>) => void;
  removeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  getActiveDownloads: () => DownloadProgress[];
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloads, setDownloads] = useState<Map<string, DownloadProgress>>(new Map());

  const addDownload = useCallback((id: string, fileName: string, url: string) => {
    setDownloads((prev) => {
      const newMap = new Map(prev);
      newMap.set(id, {
        id,
        fileName,
        url,
        progress: 0,
        downloadedBytes: 0,
        totalBytes: null,
        speed: 0,
        status: "downloading",
        startTime: Date.now(),
        estimatedTimeRemaining: null,
      });
      return newMap;
    });
  }, []);

  const updateDownload = useCallback((id: string, updates: Partial<DownloadProgress>) => {
    setDownloads((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(id);
      if (existing) {
        newMap.set(id, { ...existing, ...updates });
      }
      return newMap;
    });
  }, []);

  const removeDownload = useCallback((id: string) => {
    setDownloads((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  }, []);

  const cancelDownload = useCallback((id: string) => {
    updateDownload(id, { status: "cancelled" });
    // Remove after a short delay
    setTimeout(() => {
      removeDownload(id);
    }, 1000);
  }, [updateDownload, removeDownload]);

  const getActiveDownloads = useCallback(() => {
    return Array.from(downloads.values()).filter(
      (d) => d.status === "downloading"
    );
  }, [downloads]);

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        addDownload,
        updateDownload,
        removeDownload,
        cancelDownload,
        getActiveDownloads,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloads() {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error("useDownloads must be used within DownloadProvider");
  }
  return context;
}

