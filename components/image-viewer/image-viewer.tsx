"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useImageViewer } from "@/contexts/image-viewer-context";
import { Button } from "@/components/ui/button";
import { Download, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

export function ImageViewer() {
  const { state, closeView, setZoomLevel } = useImageViewer();
  const { currentImage, zoomLevel } = state;
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Reset pan offset when image changes
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, [currentImage?.id]);

  if (!currentImage) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="text-muted-foreground">No image selected</p>
      </div>
    );
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(currentImage.fullUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = currentImage.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
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
    
    // Calculate zoom delta (smoother zooming with exponential scaling)
    // Use a smaller multiplier and exponential scaling for smoother feel
    const zoomDelta = -e.deltaY * 0.0005;
    // Apply exponential scaling for smoother zoom progression
    const zoomFactor = Math.pow(1.1, zoomDelta * 10);
    const newZoom = Math.max(0.5, Math.min(3, zoomLevel * zoomFactor));
    
    if (Math.abs(newZoom - zoomLevel) < 0.01) return; // Zoom limits reached or minimal change
    
    // Calculate offset from center before zoom
    const offsetX = mouseX - containerCenterX;
    const offsetY = mouseY - containerCenterY;
    
    // Calculate new pan offset to keep the same point under cursor after zoom
    // Scale the offset by the zoom ratio change
    const zoomRatio = newZoom / zoomLevel;
    const newPanX = panOffset.x + offsetX * (1 - zoomRatio);
    const newPanY = panOffset.y + offsetY * (1 - zoomRatio);
    
    setZoomLevel(newZoom);
    setPanOffset({ x: newPanX, y: newPanY });
  }, [zoomLevel, panOffset, setZoomLevel]);

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
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{currentImage.fileName}</h2>
          <p className="text-sm text-muted-foreground">
            {currentImage.width} × {currentImage.height} px • {(currentImage.sizeBytes / 1024).toFixed(1)} KB
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2 border-b p-2 bg-muted/50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoomLevel(zoomLevel - 0.25)}
          disabled={zoomLevel <= 0.5}
        >
          <ZoomOut className="h-4 w-4 mr-1" />
          Zoom Out
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetZoom}
          title="Reset zoom"
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
        <span className="text-sm font-medium min-w-[60px] text-center">
          {(zoomLevel * 100).toFixed(0)}%
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoomLevel(zoomLevel + 0.25)}
          disabled={zoomLevel >= 3}
        >
          <ZoomIn className="h-4 w-4 mr-1" />
          Zoom In
        </Button>
        <div className="ml-4 border-l pl-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>
      </div>

      {/* Image Display with Pan/Zoom */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-muted/20"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <div 
          ref={imageContainerRef}
          className="absolute"
          style={{ 
            top: "50%",
            left: "50%",
            transform: `translate(calc(-50% + ${panOffset.x}px), calc(-50% + ${panOffset.y}px)) scale(${zoomLevel})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.1s ease-out"
          }}
        >
          <img
            src={currentImage.fullUrl}
            alt={currentImage.fileName}
            className="block rounded shadow-lg"
            style={{ 
              maxWidth: "100vw",
              maxHeight: "100vh",
              width: "auto",
              height: "auto"
            }}
            draggable={false}
          />
        </div>

        {/* Zoom indicator */}
        {zoomLevel !== 1 && (
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/50 text-white text-xs z-10">
            {Math.round(zoomLevel * 100)}%
          </div>
        )}
      </div>
    </div>
  );
}
