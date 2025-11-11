"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { createAppLogger } from "@/lib/utils/logger";

const logger = createAppLogger("Imagen Context");

export interface GeneratedImage {
  id: string;
  data: string; // base64 encoded
  mimeType: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  generatedAt: number;
  metadata?: {
    numberOfImages?: number;
    generationTime?: number;
  };
}

interface ImagenState {
  // Current generation
  currentPrompt: string | null;
  currentImage: GeneratedImage | null;
  
  // Generation status
  isGenerating: boolean;
  generationProgress: number | null;
  generationError: string | null;
  
  // History
  history: GeneratedImage[];
  
  // UI state
  isViewOpen: boolean;
  zoomLevel: number;
}

interface ImagenContextValue {
  state: ImagenState;
  startGeneration: (prompt: string, options?: {
    aspectRatio?: string;
    model?: string;
    numberOfImages?: number;
  }) => void;
  setGenerationProgress: (progress: number | null) => void;
  completeGeneration: (image: Omit<GeneratedImage, "id" | "generatedAt">, imageId?: string) => void;
  setGenerationError: (error: string | null) => void;
  downloadImage: (imageId: string) => Promise<void>;
  regenerateImage: () => void;
  clearHistory: () => void;
  openView: () => void;
  closeView: () => void;
  setZoomLevel: (level: number) => void;
  setCurrentImageFromHistory: (image: GeneratedImage | null) => void;
  currentImageId: string | null; // NEW: Expose current image ID for chat API
}

const ImagenContext = createContext<ImagenContextValue | null>(null);

function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function ImagenProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgressState] = useState<number | null>(null);
  const [generationError, setGenerationErrorState] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [zoomLevel, setZoomLevelState] = useState(1);
  const [sessionStartAttempted, setSessionStartAttempted] = useState<string | null>(null); // Track which imageId we've attempted to start session for

  const startGeneration = useCallback((prompt: string, options?: {
    aspectRatio?: string;
    model?: string;
    numberOfImages?: number;
  }) => {
    setCurrentPrompt(prompt);
    setIsGenerating(true);
    setGenerationProgressState(null);
    setGenerationErrorState(null);
    setIsViewOpen(true);
  }, []);

  const setGenerationProgress = useCallback((progress: number | null) => {
    setGenerationProgressState(progress);
  }, []);

  const completeGeneration = useCallback((image: Omit<GeneratedImage, "id" | "generatedAt">, imageId?: string) => {
    const newImage: GeneratedImage = {
      ...image,
      id: imageId || generateImageId(), // Use provided ID (from database) or generate one
      generatedAt: Date.now(),
    };
    
    setCurrentImage(newImage);
    setIsGenerating(false);
    setGenerationProgressState(null);
    setGenerationErrorState(null);
    setIsViewOpen(true); // Ensure view stays open when image completes
    
    // Add to history
    setHistory((prev) => [newImage, ...prev].slice(0, 20)); // Keep last 20
  }, []);

  const setGenerationError = useCallback((error: string | null) => {
    setGenerationErrorState(error);
    setIsGenerating(false);
    setGenerationProgressState(null);
    setIsViewOpen(true); // Keep view open to show error message
  }, []);

  const downloadImage = useCallback(async (imageId: string) => {
    const image = currentImage?.id === imageId ? currentImage : history.find(img => img.id === imageId);
    if (!image) return;

    try {
      // Convert base64 to blob
      const byteCharacters = atob(image.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: image.mimeType });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const extension = image.mimeType.split("/")[1] || "png";
      link.download = `imagen-${image.id}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download image:", error);
      throw error;
    }
  }, [currentImage, history]);

  const regenerateImage = useCallback(() => {
    if (!currentPrompt) return;
    startGeneration(currentPrompt);
  }, [currentPrompt, startGeneration]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const openView = useCallback(() => {
    setIsViewOpen(true);
  }, []);

  const closeView = useCallback(() => {
    setIsViewOpen(false);
    setCurrentImage(null);
    setCurrentPrompt(null);
    setIsGenerating(false);
    setGenerationProgressState(null);
    setGenerationErrorState(null);
  }, []);

  const setZoomLevel = useCallback((level: number) => {
    setZoomLevelState(Math.max(0.5, Math.min(3, level))); // Clamp between 0.5x and 3x
  }, []);

  const setCurrentImageFromHistory = useCallback((image: GeneratedImage | null) => {
    setCurrentImage(image);
    if (image) {
      setIsViewOpen(true);
    }
  }, []);

  // Note: No MCP session needed anymore! Image editing uses direct API routes like email/GitHub

  const state = useMemo(() => ({
    currentPrompt,
    currentImage,
    isGenerating,
    generationProgress,
    generationError,
    history,
    isViewOpen,
    zoomLevel,
  }), [currentPrompt, currentImage, isGenerating, generationProgress, generationError, history, isViewOpen, zoomLevel]);

  const contextValue = useMemo(() => ({
    state,
    startGeneration,
    setGenerationProgress,
    completeGeneration,
    setGenerationError,
    downloadImage,
    regenerateImage,
    clearHistory,
    openView,
    closeView,
    setZoomLevel,
    setCurrentImageFromHistory,
    currentImageId: currentImage?.id || null, // Expose current image ID
  }), [
    state,
    startGeneration,
    setGenerationProgress,
    completeGeneration,
    setGenerationError,
    downloadImage,
    regenerateImage,
    clearHistory,
    openView,
    closeView,
    setZoomLevel,
    setCurrentImageFromHistory,
    currentImage?.id,
  ]);

  return (
    <ImagenContext.Provider value={contextValue}>
      {children}
    </ImagenContext.Provider>
  );
}

export function useImagen() {
  const context = useContext(ImagenContext);
  if (!context) {
    throw new Error("useImagen must be used within ImagenProvider");
  }
  return context;
}

