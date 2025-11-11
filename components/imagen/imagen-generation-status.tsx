"use client";

import { useImagen } from "@/contexts/imagen-context";
import { Loader2 } from "lucide-react";

export function ImagenGenerationStatus() {
  const { state } = useImagen();
  const { generationProgress } = state;

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-4">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">Generating image...</p>
          {generationProgress !== null && (
            <p className="text-xs text-muted-foreground mt-1">
              {generationProgress}% complete
            </p>
          )}
        </div>
      </div>
      {generationProgress !== null && (
        <div className="mt-4 w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${generationProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}

