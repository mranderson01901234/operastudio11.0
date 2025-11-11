"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Download, Maximize2, Copy, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useImagen } from "@/contexts/imagen-context";
import type { GeneratedImage } from "@/contexts/imagen-context";

interface ImagenDisplayProps {
  image: GeneratedImage;
}

export function ImagenDisplay({ image }: ImagenDisplayProps) {
  const { state, setZoomLevel, downloadImage } = useImagen();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const imageUrl = `data:${image.mimeType};base64,${image.data}`;
  const zoom = state.zoomLevel;

  // Reset pan offset when image changes
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, [image.id]);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await downloadImage(image.id);
    } catch (error) {
      console.error("Failed to download image:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopy = async () => {
    try {
      // Convert base64 to blob
      const byteCharacters = atob(image.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: image.mimeType });

      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ [image.mimeType]: blob })
      ]);
    } catch (error) {
      console.error("Failed to copy image:", error);
      // Fallback: copy image URL
      try {
        await navigator.clipboard.writeText(imageUrl);
      } catch (e) {
        console.error("Failed to copy image URL:", e);
      }
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(zoom + 0.25);
  };

  const handleZoomOut = () => {
    setZoomLevel(zoom - 0.25);
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Handle mouse wheel zoom that follows cursor
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    if (!containerRef.current || !imageContainerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    // Get mouse position relative to container center
    const containerCenterX = rect.width / 2;
    const containerCenterY = rect.height / 2;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate zoom delta (smooth zooming)
    const zoomDelta = -e.deltaY * 0.001;
    const newZoom = Math.max(0.5, Math.min(3, zoom + zoomDelta));
    
    if (newZoom === zoom) return; // Zoom limits reached
    
    // Calculate offset from center before zoom
    const offsetX = mouseX - containerCenterX;
    const offsetY = mouseY - containerCenterY;
    
    // Calculate new pan offset to keep the same point under cursor after zoom
    // Scale the offset by the zoom ratio change
    const zoomRatio = newZoom / zoom;
    const newPanX = panOffset.x + offsetX * (1 - zoomRatio);
    const newPanY = panOffset.y + offsetY * (1 - zoomRatio);
    
    setZoomLevel(newZoom);
    setPanOffset({ x: newPanX, y: newPanY });
  }, [zoom, panOffset, setZoomLevel]);

  // Handle drag to pan at any zoom level
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left mouse button
    
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const containerCenterX = rect.left + rect.width / 2;
    const containerCenterY = rect.top + rect.height / 2;
    
    setIsDragging(true);
    // Store the initial mouse position relative to container center
    setDragStart({ 
      x: e.clientX - containerCenterX - panOffset.x, 
      y: e.clientY - containerCenterY - panOffset.y 
    });
    e.preventDefault();
  }, [panOffset]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const containerCenterX = rect.left + rect.width / 2;
    const containerCenterY = rect.top + rect.height / 2;
    
    // Calculate new pan offset relative to container center
    const newPanX = e.clientX - containerCenterX - dragStart.x;
    const newPanY = e.clientY - containerCenterY - dragStart.y;
    
    setPanOffset({ x: newPanX, y: newPanY });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Attach global mouse move/up handlers for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="relative group w-full h-full">
      <div 
        ref={containerRef}
        className="absolute inset-0 overflow-visible"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? "grabbing" : "grab", zIndex: 1 }}
      >
        <div 
          ref={imageContainerRef}
          className="absolute"
          style={{ 
            top: "50%",
            left: "50%",
            transform: `translate(calc(-50% + ${panOffset.x}px), calc(-50% + ${panOffset.y}px)) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.1s ease-out"
          }}
        >
          <img
            src={imageUrl}
            alt={image.prompt}
            className="block"
            style={{ 
              maxWidth: "100vw",
              maxHeight: "100vh",
              width: "auto",
              height: "auto"
            }}
            loading="lazy"
            draggable={false}
          />
        </div>
        
        {/* Overlay Controls */}
        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Button
            variant="secondary"
            size="icon"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="h-8 w-8"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleResetZoom}
            className="h-8 w-8"
            title="Reset zoom"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="h-8 w-8"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-8 w-8"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleCopy}
            className="h-8 w-8"
            title="Copy image"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleDownload}
            disabled={isDownloading}
            className="h-8 w-8"
            title="Download image"
          >
            {isDownloading ? (
              <RotateCcw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Zoom indicator */}
        {zoom !== 1 && (
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/50 text-white text-xs z-10">
            {Math.round(zoom * 100)}%
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={imageUrl}
              alt={image.prompt}
              className="max-w-full max-h-[90vh] object-contain"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(false)}
              className="absolute top-2 right-2"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

