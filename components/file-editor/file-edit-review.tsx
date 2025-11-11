"use client";

import { useFileEditor } from "@/contexts/file-editor-context";
import { calculateFileDiff, formatDiffSummary } from "@/lib/file-editor/diff-calculator";
import { Check, X, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileEditReviewProps {
  filePath: string;
}

export function FileEditReview({ filePath }: FileEditReviewProps) {
  const { state, acceptPendingEdit, rejectPendingEdit } = useFileEditor();
  const file = state.openFiles.get(filePath);

  if (!file || !file.pendingEdit) {
    return null;
  }

  const originalContent = file.originalContent || file.content;
  const diff = calculateFileDiff(originalContent, file.pendingEdit.proposedContent);
  const summary = formatDiffSummary(diff);

  const handleAccept = async () => {
    await acceptPendingEdit(filePath);
  };

  const handleReject = () => {
    rejectPendingEdit(filePath);
  };

  return (
    <div className="border-t border-border/50 bg-background/95 backdrop-blur-sm">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <FileEdit className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  Pending Edit Review
                </h3>
                <p className="text-xs text-muted-foreground mb-2">
                  {file.pendingEdit.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="font-medium">{summary}</span>
                  <span className="text-muted-foreground/70">
                    {file.path.split("/").pop()}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mt-3">
              <Button
                onClick={handleAccept}
                size="sm"
                className="h-8 text-xs"
                variant="default"
              >
                <Check className="h-3 w-3 mr-1.5" />
                Accept Changes
              </Button>
              <Button
                onClick={handleReject}
                size="sm"
                className="h-8 text-xs"
                variant="outline"
              >
                <X className="h-3 w-3 mr-1.5" />
                Reject
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

