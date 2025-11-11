"use client";

import React from "react";
import { X, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { useDownloads, type DownloadProgress } from "@/contexts/download-context";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return "--:--";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function DownloadItem({ download }: { download: DownloadProgress }) {
  const { cancelDownload, removeDownload } = useDownloads();

  const handleCancel = () => {
    cancelDownload(download.id);
  };

  const handleRemove = () => {
    removeDownload(download.id);
  };

  const getStatusIcon = () => {
    switch (download.status) {
      case "downloading":
        return <Download className="h-4 w-4 animate-pulse text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "cancelled":
        return <X className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    switch (download.status) {
      case "downloading":
        return "Downloading...";
      case "completed":
        return "Completed";
      case "error":
        return `Error: ${download.error || "Unknown error"}`;
      case "cancelled":
        return "Cancelled";
    }
  };

  return (
    <div className="bg-background/80 backdrop-blur-sm border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {getStatusIcon()}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" title={download.fileName}>
              {download.fileName}
            </div>
            <div className="text-xs text-muted-foreground truncate" title={download.url}>
              {download.url}
            </div>
          </div>
        </div>
        {download.status === "downloading" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleCancel}
            title="Cancel download"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        {(download.status === "completed" || download.status === "error" || download.status === "cancelled") && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleRemove}
            title="Remove"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {download.status === "downloading" && (
        <>
          <Progress value={download.progress} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>
                {formatBytes(download.downloadedBytes)}
                {download.totalBytes !== null && ` / ${formatBytes(download.totalBytes)}`}
              </span>
              <span>{download.progress.toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-4">
              {download.speed > 0 && <span>{formatSpeed(download.speed)}</span>}
              {download.estimatedTimeRemaining !== null && (
                <span>{formatTime(download.estimatedTimeRemaining)} remaining</span>
              )}
            </div>
          </div>
        </>
      )}

      {(download.status === "completed" || download.status === "error" || download.status === "cancelled") && (
        <div className="text-xs text-muted-foreground">{getStatusText()}</div>
      )}
    </div>
  );
}

export function DownloadProgressPanel() {
  const { getActiveDownloads, downloads } = useDownloads();
  const activeDownloads = getActiveDownloads();
  const allDownloads = Array.from(downloads.values());

  // Show completed/error downloads for 5 seconds before auto-removing
  const recentDownloads = allDownloads.filter((d) => {
    if (d.status === "downloading") return true;
    const timeSinceCompletion = Date.now() - (d.startTime + (d.status === "completed" ? 5000 : 0));
    return timeSinceCompletion < 5000;
  });

  if (recentDownloads.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] space-y-2">
      {recentDownloads.map((download) => (
        <DownloadItem key={download.id} download={download} />
      ))}
    </div>
  );
}

