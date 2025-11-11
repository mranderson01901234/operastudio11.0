"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import type { ImageAttachment } from "@/lib/types/chat";

interface ImageViewerState {
  currentImage: ImageAttachment | null;
  isViewOpen: boolean;
  zoomLevel: number;
}

interface ImageViewerContextValue {
  state: ImageViewerState;
  openImage: (image: ImageAttachment) => void;
  closeView: () => void;
  setZoomLevel: (level: number) => void;
}

const ImageViewerContext = createContext<ImageViewerContextValue | null>(null);

export function ImageViewerProvider({ children }: { children: ReactNode }) {
  const [currentImage, setCurrentImage] = useState<ImageAttachment | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [zoomLevel, setZoomLevelState] = useState(1);

  const openImage = useCallback((image: ImageAttachment) => {
    setCurrentImage(image);
    setIsViewOpen(true);
    setZoomLevelState(1); // Reset zoom when opening new image
  }, []);

  const closeView = useCallback(() => {
    setIsViewOpen(false);
    setCurrentImage(null);
    setZoomLevelState(1);
  }, []);

  const setZoomLevel = useCallback((level: number) => {
    setZoomLevelState(Math.max(0.5, Math.min(3, level))); // Clamp between 0.5x and 3x
  }, []);

  const state = useMemo(() => ({
    currentImage,
    isViewOpen,
    zoomLevel,
  }), [currentImage, isViewOpen, zoomLevel]);

  const contextValue = useMemo(() => ({
    state,
    openImage,
    closeView,
    setZoomLevel,
  }), [state, openImage, closeView, setZoomLevel]);

  return (
    <ImageViewerContext.Provider value={contextValue}>
      {children}
    </ImageViewerContext.Provider>
  );
}

export function useImageViewer() {
  const context = useContext(ImageViewerContext);
  if (!context) {
    throw new Error("useImageViewer must be used within ImageViewerProvider");
  }
  return context;
}
