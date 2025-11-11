"use client";

import { useImagen } from "@/contexts/imagen-context";
import { ImagenPromptDisplay } from "./imagen-prompt-display";
import { ImagenGenerationStatus } from "./imagen-generation-status";
import { ImagenDisplay } from "./imagen-display";
import { ImagenControls } from "./imagen-controls";

export function ImagenGeneratorView() {
  const { state } = useImagen();
  const { currentImage, currentPrompt, isGenerating, generationError } = state;

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header - positioned above image */}
      <div className="border-b p-4 relative z-30 bg-background">
        <h2 className="text-lg font-semibold">Image Generation</h2>
      </div>

      {/* Content Area */}
      {currentImage && !isGenerating ? (
        // When image is displayed, use absolute positioning to allow image to fill space
        <div className="flex-1 min-h-0 relative">
          {/* Image Display - fills entire content area */}
          <ImagenDisplay image={currentImage} />
        </div>
      ) : (
        // When no image, use normal scrollable layout
        <div className="flex-1 min-h-0 overflow-auto p-6 space-y-6">
          {/* Prompt Display */}
          {currentPrompt && (
            <ImagenPromptDisplay prompt={currentPrompt} />
          )}

          {/* Generation Status */}
          {isGenerating && (
            <ImagenGenerationStatus />
          )}

          {/* Error Display */}
          {generationError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">Generation Failed</p>
              <p className="text-xs text-red-500 dark:text-red-500 mt-1">{generationError}</p>
            </div>
          )}

          {/* Empty State */}
          {!currentImage && !isGenerating && !currentPrompt && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <p className="text-lg mb-2">Ready to generate</p>
                <p className="text-sm">Ask me to create an image in the chat</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls - positioned above image */}
      {currentImage && (
        <div className="border-t p-4 relative z-30 bg-background">
          <ImagenControls />
        </div>
      )}
    </div>
  );
}

