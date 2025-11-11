"use client";

import { X, Circle } from "lucide-react";
import { useFileEditor } from "@/contexts/file-editor-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function FileTabs() {
  const { state, setActiveFile, closeFile } = useFileEditor();
  const { openFiles, activeFile } = state;

  const files = Array.from(openFiles.values());

  if (files.length === 0) {
    return (
      <div className="h-10 border-b border-border/50 bg-[#1a1a1a] flex items-center px-4 text-sm text-muted-foreground">
        No files open
      </div>
    );
  }

  return (
    <div className="h-10 border-b border-border/50 bg-[#1a1a1a] flex items-center overflow-x-auto">
      {files.map((file) => {
        const isActive = file.path === activeFile;
        const fileName = file.path.split("/").pop() || file.path;

        return (
          <div
            key={file.path}
            className={cn(
              "h-full flex items-center gap-2 px-3 border-r border-border/50 cursor-pointer transition-colors group",
              isActive
                ? "bg-[#252526] border-b-2 border-b-primary text-foreground"
                : "bg-[#1a1a1a] hover:bg-[#252526] text-muted-foreground"
            )}
            onClick={() => setActiveFile(file.path)}
          >
            <span className="text-sm truncate max-w-[200px]">{fileName}</span>
            {file.isModified && (
              <Circle className="w-2 h-2 fill-current text-primary" />
            )}
            {file.isStreaming && (
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
            {file.error && (
              <span className="text-xs text-destructive" title={file.error}>
                ⚠
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                closeFile(file.path);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

