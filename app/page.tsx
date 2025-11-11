"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import { useFileEditor } from "@/contexts/file-editor-context";
import { useFileSystem } from "@/contexts/filesystem-context";
import { useEmail } from "@/contexts/email-context";
import { useGitHub } from "@/contexts/github-context";
import { useImagen } from "@/contexts/imagen-context";
import { useImageViewer } from "@/contexts/image-viewer-context";

// Lazy load heavy components to improve initial page load
const ChatInterface = dynamic(() => import("@/components/chat/chat-interface").then(mod => ({ default: mod.ChatInterface })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-sm text-muted-foreground">Loading...</div>
    </div>
  ),
});

const SplitView = dynamic(() => import("@/components/layout/split-view").then(mod => ({ default: mod.SplitView })), {
  ssr: false,
});

const FileEditorView = dynamic(() => import("@/components/file-editor/file-editor-view").then(mod => ({ default: mod.FileEditorView })), {
  ssr: false,
});

const EmailViewer = dynamic(() => import("@/components/email/email-viewer").then(mod => ({ default: mod.EmailViewer })), {
  ssr: false,
});

const ImagenGeneratorView = dynamic(() => import("@/components/imagen/imagen-generator-view").then(mod => ({ default: mod.ImagenGeneratorView })), {
  ssr: false,
});

const ImageViewer = dynamic(() => import("@/components/image-viewer/image-viewer").then(mod => ({ default: mod.ImageViewer })), {
  ssr: false,
});

// Memoize MainContent to prevent unnecessary re-renders
const MainContent = memo(function MainContent() {
  const { state: fileEditorState, closeAllFiles } = useFileEditor();
  const { selectedTool } = useFileSystem();
  const { state: emailState, setActiveEmail } = useEmail();
  const { state: githubState, deselectRepository } = useGitHub();
  const { state: imagenState, closeView: closeImagenView } = useImagen();
  const { state: imageViewerState, closeView: closeImageViewer } = useImageViewer();

  const hasOpenFiles = fileEditorState.openFiles.size > 0;
  const hasActiveEmail = emailState.activeEmail !== null;
  const hasSelectedRepo = githubState.selectedRepository !== null;
  const hasActiveImage = imagenState.isViewOpen && imagenState.currentImage !== null;
  const hasUploadedImage = imageViewerState.isViewOpen && imageViewerState.currentImage !== null;

  // Show file split view if files are open (highest priority - files override other views)
  // This is the ONLY time we show split view - when a file is actually opened in the editor
  if (hasOpenFiles) {
    return (
      <SplitView
        left={<ChatInterface key="chat-interface" />}
        right={<FileEditorView />}
        defaultRatio={0.5}
        minLeft={300}
        minRight={400}
        onClose={closeAllFiles}
      />
    );
  }

  // Show uploaded image split view if image is being viewed
  if (hasUploadedImage) {
    return (
      <SplitView
        left={<ChatInterface key="chat-interface" />}
        right={<ImageViewer />}
        defaultRatio={0.5}
        minLeft={300}
        minRight={400}
        onClose={closeImageViewer}
      />
    );
  }

  // Show image split view if image is being generated, displayed, or has an error
  if (hasActiveImage || imagenState.isGenerating || (imagenState.isViewOpen && imagenState.generationError)) {
    return (
      <SplitView
        left={<ChatInterface key="chat-interface" />}
        right={<ImagenGeneratorView />}
        defaultRatio={0.5}
        minLeft={300}
        minRight={400}
        onClose={closeImagenView}
      />
    );
  }

  // Show email split view if email is selected
  if (selectedTool === "email" && hasActiveEmail) {
    return (
      <SplitView
        left={<ChatInterface key="chat-interface" />}
        right={<EmailViewer />}
        defaultRatio={0.5}
        minLeft={300}
        minRight={400}
        onClose={() => setActiveEmail(null)}
      />
    );
  }

  // Always show full chat view for GitHub (repository selection only changes sidebar)
  // Files are opened via the file editor, which triggers the split view above
  return <ChatInterface key="chat-interface" />;
});

export default function Home() {
  return (
    <main className="relative flex h-svh flex-col bg-background overflow-hidden min-w-0">
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <MainContent />
      </div>
    </main>
  );
}
