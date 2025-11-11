"use client";

import { useState } from "react";
import { Download, RotateCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useImagen } from "@/contexts/imagen-context";

export function ImagenControls() {
  const { state, downloadImage, regenerateImage, closeView } = useImagen();
  const { currentImage } = state;
  const [isDownloading, setIsDownloading] = useState(false);

  if (!currentImage) return null;

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await downloadImage(currentImage.id);
    } catch (error) {
      console.error("Failed to download image:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleDownload}
        disabled={isDownloading}
        className="flex-1"
      >
        <Download className="h-4 w-4 mr-2" />
        {isDownloading ? "Downloading..." : "Download"}
      </Button>
      <Button
        variant="outline"
        onClick={regenerateImage}
        className="flex-1"
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        Regenerate
      </Button>
      <Button
        variant="outline"
        onClick={closeView}
      >
        <Plus className="h-4 w-4 mr-2" />
        New
      </Button>
    </div>
  );
}

