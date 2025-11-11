"use client";

interface ImagenPromptDisplayProps {
  prompt: string;
  model?: string;
  aspectRatio?: string;
}

export function ImagenPromptDisplay({ prompt, model, aspectRatio }: ImagenPromptDisplayProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Prompt</span>
        {model && (
          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
            {model}
          </span>
        )}
        {aspectRatio && (
          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
            {aspectRatio}
          </span>
        )}
      </div>
      <p className="text-sm text-foreground">{prompt}</p>
    </div>
  );
}

