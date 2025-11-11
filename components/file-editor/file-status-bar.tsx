"use client";

import { useFileEditor } from "@/contexts/file-editor-context";

export function FileStatusBar() {
  const { state } = useFileEditor();
  const { activeFile, openFiles } = state;

  const file = activeFile ? openFiles.get(activeFile) : null;

  if (!file) {
    return (
      <div className="h-6 border-t border-border/50 bg-[#1a1a1a] flex items-center px-4 text-xs text-muted-foreground">
        Ready
      </div>
    );
  }

  const lineCount = file.content.split("\n").length;
  const byteCount = new TextEncoder().encode(file.content).length;
  const statusText = file.isStreaming
    ? "Streaming..."
    : file.isModified
      ? "Modified"
      : file.error
        ? `Error: ${file.error}`
        : "Saved";

  return (
    <div className="h-6 border-t border-border/50 bg-[#1a1a1a] flex items-center justify-between px-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>
          {file.language ? file.language.charAt(0).toUpperCase() + file.language.slice(1) : "Plain text"}
        </span>
        <span>{lineCount} lines</span>
        <span>{formatBytes(byteCount)}</span>
      </div>
      <div className="flex items-center gap-2">
        {file.isStreaming && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>{statusText}</span>
          </div>
        )}
        {!file.isStreaming && <span>{statusText}</span>}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

