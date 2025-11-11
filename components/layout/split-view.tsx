"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SplitViewProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultRatio?: number;
  minLeft?: number;
  minRight?: number;
  className?: string;
  onClose?: () => void;
}

export function SplitView({
  left,
  right,
  defaultRatio = 0.5,
  minLeft = 300,
  minRight = 400,
  className,
  onClose,
}: SplitViewProps) {
  const [ratio, setRatio] = useState(defaultRatio);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [windowWidth, setWindowWidth] = useState(0);

  // Track window width for responsive min values
  useEffect(() => {
    const updateWidth = () => {
      setWindowWidth(window.innerWidth);
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Calculate responsive min values based on screen size
  const getResponsiveMinLeft = () => {
    if (windowWidth === 0) return minLeft; // Initial render
    if (windowWidth < 640) return Math.min(minLeft, windowWidth * 0.4); // Mobile: max 40% of screen
    if (windowWidth < 768) return Math.min(minLeft, 250); // Small tablets
    return minLeft; // Desktop
  };

  const getResponsiveMinRight = () => {
    if (windowWidth === 0) return minRight; // Initial render
    if (windowWidth < 640) return Math.min(minRight, windowWidth * 0.4); // Mobile: max 40% of screen
    if (windowWidth < 768) return Math.min(minRight, 300); // Small tablets
    return minRight; // Desktop
  };

  const responsiveMinLeft = getResponsiveMinLeft();
  const responsiveMinRight = getResponsiveMinRight();

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRatio = (e.clientX - rect.left) / rect.width;
      const clampedRatio = Math.max(
        responsiveMinLeft / rect.width,
        Math.min(1 - responsiveMinRight / rect.width, newRatio)
      );
      setRatio(clampedRatio);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, responsiveMinLeft, responsiveMinRight]);

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full w-full overflow-hidden min-w-0", className)}
    >
      <div
        style={{ width: `${ratio * 100}%`, minWidth: 0 }}
        className="flex-shrink-0 overflow-hidden min-w-0"
      >
        {left}
      </div>
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "w-1 cursor-col-resize bg-border hover:bg-primary/20 transition-colors flex-shrink-0",
          isResizing && "bg-primary/40"
        )}
        role="separator"
        aria-label="Resize panels"
      />
      <div
        style={{ width: `${(1 - ratio) * 100}%`, minWidth: 0 }}
        className="flex-shrink-0 overflow-hidden relative min-w-0"
      >
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-50 h-8 w-8 rounded-md hover:bg-accent"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {right}
      </div>
    </div>
  );
}

