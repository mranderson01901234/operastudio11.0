"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, X, Check } from "lucide-react";
import type { BatchValidationResult } from "@/lib/utils/batch-validator-types";
import { formatBytes } from "@/lib/utils/batch-validator-types";

interface BatchConfirmationDialogProps {
  validation: BatchValidationResult;
  onConfirm: () => void;
  onCancel: () => void;
  open: boolean;
}

export function BatchConfirmationDialog({
  validation,
  onConfirm,
  onCancel,
  open,
}: BatchConfirmationDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <h2 className="text-lg font-semibold">
              Confirm {validation.operation.toUpperCase()} Operation
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Safety Level Alert */}
          <Alert
            variant={
              validation.safetyLevel === "dangerous"
                ? "destructive"
                : validation.safetyLevel === "moderate"
                ? "default"
                : "default"
            }
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Safety Level:</strong> {validation.safetyLevel.toUpperCase()}
              {validation.safetyLevel === "dangerous" && (
                <span className="block mt-1 text-sm">
                  ⚠️ This operation will affect {validation.targets.length} items and cannot be
                  undone automatically.
                </span>
              )}
            </AlertDescription>
          </Alert>

          {/* Summary */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Targets:</span>
                <span className="ml-2 font-medium">{validation.targets.length} items</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Size:</span>
                <span className="ml-2 font-medium">
                  {formatBytes(validation.totalSize)}
                </span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {validation.warnings.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">⚠️ Warnings:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {validation.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview Items */}
          {validation.targets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                Items to be affected ({validation.targets.length} total):
              </h3>
              <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1">
                {validation.targets.slice(0, 20).map((target, index) => (
                  <div
                    key={index}
                    className="text-sm flex items-center gap-2 p-1 hover:bg-muted rounded"
                  >
                    <span>{target.type === "directory" ? "📁" : "📄"}</span>
                    <code className="text-xs flex-1 truncate">{target.path}</code>
                    {target.size && (
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(target.size)}
                      </span>
                    )}
                  </div>
                ))}
                {validation.targets.length > 20 && (
                  <div className="text-xs text-muted-foreground text-center py-2">
                    ... and {validation.targets.length - 20} more items
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={validation.safetyLevel === "dangerous" ? "destructive" : "default"}
            onClick={onConfirm}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Confirm {validation.operation.toUpperCase()}
          </Button>
        </div>
      </div>
    </div>
  );
}


