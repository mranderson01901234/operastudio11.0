# Imagen 4 UI Design - 50/50 Split View

**Date:** 2025-01-27  
**Status:** Design Complete

---

## Overview

The Imagen 4 feature will use a **50/50 split view** similar to the file editor, with chat on the left and image generation panel on the right. This provides a seamless experience where users can generate images while maintaining conversation context.

---

## UI Layout

### Split View Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Application                         │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                      │
│   Chat Interface     │   Image Generator View              │
│   (Left 50%)         │   (Right 50%)                       │
│                      │                                      │
│  - Messages          │  - Prompt Display                   │
│  - Input Box         │  - Generation Status                │
│  - Tool Calls        │  - Generated Image                  │
│                      │  - Image Controls                   │
│                      │  - Image History (optional)          │
│                      │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

---

## Component Structure

### New Components

```
components/
├── imagen/
│   ├── imagen-generator-view.tsx      # Main container (right panel)
│   ├── imagen-prompt-display.tsx      # Shows current prompt
│   ├── imagen-generation-status.tsx    # Progress/status indicator
│   ├── imagen-display.tsx             # Image display with controls
│   ├── imagen-controls.tsx             # Download, regenerate, etc.
│   └── imagen-history.tsx             # Image history/gallery (optional)

contexts/
└── imagen-context.tsx                 # Image generation state management
```

---

## Detailed UI Design

### 1. Image Generator View (`imagen-generator-view.tsx`)

**Layout:**
```
┌─────────────────────────────────────┐
│  Image Generation                    │
├─────────────────────────────────────┤
│                                     │
│  [Prompt Display Area]              │
│  "A serene mountain landscape..."   │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  [Generation Status]                │
│  ⏳ Generating... (45%)            │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  [Image Display Area]               │
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  │      Generated Image        │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  [Image Controls]                  │
│  [Download] [Regenerate] [New]    │
│                                     │
└─────────────────────────────────────┘
```

**Features:**
- Shows current generation prompt
- Displays generation progress/status
- Large image display area
- Action buttons at bottom
- Optional image history sidebar

### 2. Prompt Display (`imagen-prompt-display.tsx`)

**Shows:**
- Current prompt text
- Model variant used (e.g., "Imagen 4 Ultra")
- Aspect ratio
- Number of images generated

**Visual Design:**
- Card with subtle background
- Read-only text display
- Metadata badges (model, aspect ratio)

### 3. Generation Status (`imagen-generation-status.tsx`)

**States:**
- **Idle**: "Ready to generate"
- **Generating**: Progress indicator with percentage
- **Complete**: "Generation complete"
- **Error**: Error message with retry option

**Visual Design:**
- Loading spinner during generation
- Progress bar (if available from API)
- Status text
- Time elapsed

### 4. Image Display (`imagen-display.tsx`)

**Features:**
- Full-size image display
- Zoom controls (fit, 100%, zoom in/out)
- Pan/drag when zoomed
- Image metadata overlay (hover)
- Loading placeholder

**Controls:**
- Maximize/fullscreen button
- Download button
- Copy image button
- Share button (optional)

### 5. Image Controls (`imagen-controls.tsx`)

**Buttons:**
- **Download**: Save image to disk
- **Regenerate**: Generate again with same prompt
- **New**: Start new generation
- **Copy Prompt**: Copy prompt to clipboard
- **Edit Prompt**: Modify prompt and regenerate

**Layout:**
- Horizontal button group
- Primary action (Download) highlighted
- Secondary actions grouped

### 6. Image History (Optional) (`imagen-history.tsx`)

**Features:**
- Thumbnail grid of previous generations
- Click to view full image
- Delete individual images
- Clear all history

**Layout:**
- Collapsible sidebar or bottom panel
- Thumbnail grid (2-3 columns)
- Scrollable if many images

---

## State Management

### Image Context (`contexts/imagen-context.tsx`)

**State:**
```typescript
interface ImagenState {
  // Current generation
  currentPrompt: string | null;
  currentImage: {
    data: string; // base64
    mimeType: string;
    prompt: string;
    model: string;
    aspectRatio: string;
    generatedAt: number;
  } | null;
  
  // Generation status
  isGenerating: boolean;
  generationProgress: number | null;
  generationError: string | null;
  
  // History
  history: Array<{
    id: string;
    data: string;
    prompt: string;
    model: string;
    generatedAt: number;
  }>;
  
  // UI state
  isViewOpen: boolean;
  zoomLevel: number;
}
```

**Actions:**
- `startGeneration(prompt, options)`
- `setGenerationProgress(progress)`
- `completeGeneration(imageData)`
- `setGenerationError(error)`
- `downloadImage(imageId)`
- `regenerateImage(imageId)`
- `clearHistory()`
- `openView()`
- `closeView()`

---

## Integration with Chat Interface

### Triggering Image Generation

**Flow:**
1. User types prompt in chat: "Create an image of a sunset over mountains"
2. LLM calls `imagen_generate` tool
3. Tool handler executes generation
4. **Image context opens split view automatically**
5. Right panel shows generation status
6. When complete, image displays in right panel
7. Chat shows confirmation message

### Chat Message Display

**In Chat:**
- Show tool call status: "Generating image..."
- When complete: Show thumbnail + link to view full image
- Click thumbnail → Opens/refocuses image view

**Message Format:**
```
[Assistant Message]
✓ Image generated successfully

[Thumbnail Image] ← Click to view full size
Prompt: "A serene mountain landscape..."
```

---

## Page Integration (`app/page.tsx`)

**Updated Logic:**
```typescript
const MainContent = memo(function MainContent() {
  const { state: fileEditorState } = useFileEditor();
  const { state: imagenState } = useImagen(); // NEW
  const { selectedTool } = useFileSystem();
  const { state: emailState } = useEmail();

  const hasOpenFiles = fileEditorState.openFiles.size > 0;
  const hasActiveImage = imagenState.isViewOpen && imagenState.currentImage; // NEW
  const hasActiveEmail = emailState.activeEmail !== null;

  // Priority: Files > Images > Email > Chat only
  if (hasOpenFiles) {
    return <SplitView left={<ChatInterface />} right={<FileEditorView />} />;
  }

  if (hasActiveImage) { // NEW
    return (
      <SplitView
        left={<ChatInterface />}
        right={<ImagenGeneratorView />}
        defaultRatio={0.5}
        minLeft={300}
        minRight={400}
        onClose={() => imagenState.closeView()}
      />
    );
  }

  if (selectedTool === "email" && hasActiveEmail) {
    return <SplitView left={<ChatInterface />} right={<EmailViewer />} />;
  }

  return <ChatInterface />;
});
```

---

## User Flow

### Scenario 1: Generate Image from Chat

1. **User types**: "Create an image of a cat wearing sunglasses"
2. **Chat sends message** → LLM processes
3. **LLM calls tool**: `imagen_generate({ prompt: "..." })`
4. **Tool handler**:
   - Calls `/api/imagen/generate`
   - Updates image context: `startGeneration()`
   - Opens split view automatically
5. **Right panel shows**:
   - Prompt display
   - Generation status: "Generating..."
   - Loading spinner
6. **When complete**:
   - Image displays in right panel
   - Status changes to "Complete"
   - Controls appear (Download, Regenerate, etc.)
   - Chat shows confirmation + thumbnail

### Scenario 2: Regenerate Image

1. **User clicks "Regenerate"** in image panel
2. **Uses same prompt** from current image
3. **Shows generation status** again
4. **Replaces image** when complete

### Scenario 3: Generate New Image

1. **User clicks "New"** in image panel
2. **Closes current image** (or keeps it in history)
3. **Returns to chat** (full width)
4. **User types new prompt** → Process repeats

### Scenario 4: View Image from History

1. **User clicks thumbnail** in chat message
2. **Opens split view** with that image
3. **Shows full image** in right panel
4. **Can download, regenerate, etc.**

---

## Visual Design Details

### Color Scheme
- **Background**: Dark theme (`bg-[#1a1a1a]` or `bg-background`)
- **Cards**: Subtle borders (`border-border`)
- **Primary Actions**: Accent color
- **Status Indicators**: 
  - Generating: Blue/Yellow
  - Complete: Green
  - Error: Red

### Typography
- **Prompt Text**: `text-sm` or `text-base`, readable
- **Status Text**: `text-xs`, muted
- **Image Metadata**: `text-xs`, very muted

### Spacing
- **Padding**: Consistent with file editor (`p-4`, `p-6`)
- **Gaps**: `gap-4` between sections
- **Margins**: `mb-4` between elements

### Responsive Behavior
- **Mobile**: Stack vertically (chat full width, image below)
- **Tablet**: 50/50 split maintained
- **Desktop**: 50/50 split with resizable divider

---

## Component Code Structure

### Image Generator View

```typescript
// components/imagen/imagen-generator-view.tsx
"use client";

import { useImagen } from "@/contexts/imagen-context";
import { ImagenPromptDisplay } from "./imagen-prompt-display";
import { ImagenGenerationStatus } from "./imagen-generation-status";
import { ImagenDisplay } from "./imagen-display";
import { ImagenControls } from "./imagen-controls";

export function ImagenGeneratorView() {
  const { state } = useImagen();
  const { currentImage, currentPrompt, isGenerating } = state;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold">Image Generation</h2>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto p-6 space-y-6">
        {/* Prompt Display */}
        {currentPrompt && (
          <ImagenPromptDisplay prompt={currentPrompt} />
        )}

        {/* Generation Status */}
        {isGenerating && (
          <ImagenGenerationStatus />
        )}

        {/* Image Display */}
        {currentImage && !isGenerating && (
          <ImagenDisplay image={currentImage} />
        )}

        {/* Empty State */}
        {!currentImage && !isGenerating && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg mb-2">Ready to generate</p>
              <p className="text-sm">Ask me to create an image in the chat</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {currentImage && (
        <div className="border-t p-4">
          <ImagenControls />
        </div>
      )}
    </div>
  );
}
```

### Image Display Component

```typescript
// components/imagen/imagen-display.tsx
"use client";

import { useState } from "react";
import { Download, Maximize2, Copy, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImagenDisplayProps {
  image: {
    data: string;
    mimeType: string;
    prompt: string;
    model: string;
    aspectRatio: string;
  };
}

export function ImagenDisplay({ image }: ImagenDisplayProps) {
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const imageUrl = `data:${image.mimeType};base64,${image.data}`;

  const handleDownload = () => {
    // Download logic
  };

  const handleCopy = () => {
    // Copy to clipboard logic
  };

  return (
    <div className="relative group">
      <div className="relative overflow-hidden rounded-lg border bg-card">
        <img
          src={imageUrl}
          alt={image.prompt}
          className="w-full h-auto object-contain"
          style={{ transform: `scale(${zoom})` }}
        />
        
        {/* Overlay Controls */}
        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="secondary" size="icon" onClick={() => setZoom(zoom + 0.1)}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" onClick={() => setIsFullscreen(!isFullscreen)}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" onClick={handleCopy}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <div className="mt-2 text-xs text-muted-foreground">
        <p className="truncate" title={image.prompt}>
          Prompt: {image.prompt}
        </p>
        <p>Model: {image.model} • Aspect: {image.aspectRatio}</p>
      </div>
    </div>
  );
}
```

---

## Tool Handler Integration

### Update Tool Handler

When `imagen_generate` tool completes:

```typescript
// In lib/chat/tool-handler.ts or chat-interface.tsx

if (toolCall.name === "imagen_generate" && !result.error && result.result) {
  const imagenResult = result.result as {
    success: boolean;
    images: Array<{ data: string; mimeType: string }>;
    model: string;
    metadata: { prompt: string; aspectRatio: string };
  };

  if (imagenResult.success && imagenResult.images.length > 0) {
    // Update image context
    const { openView, completeGeneration } = useImagen();
    
    // Open split view
    openView();
    
    // Set generated image
    completeGeneration({
      data: imagenResult.images[0].data,
      mimeType: imagenResult.images[0].mimeType,
      prompt: imagenResult.metadata.prompt,
      model: imagenResult.model,
      aspectRatio: imagenResult.metadata.aspectRatio,
      generatedAt: Date.now(),
    });
  }
}
```

---

## Accessibility

- **Keyboard Navigation**: All controls accessible via keyboard
- **Screen Readers**: Proper ARIA labels
- **Focus Management**: Focus moves to image panel when opened
- **Alt Text**: Image alt text includes prompt description
- **Color Contrast**: Meets WCAG AA standards

---

## Performance Considerations

- **Image Loading**: Lazy load images
- **Base64 Handling**: Convert to blob URLs for large images
- **History Storage**: Limit history size (e.g., last 20 images)
- **Thumbnails**: Generate thumbnails for history view
- **Caching**: Cache generated images in browser storage

---

## Future Enhancements

- **Image Editing**: Inpainting, style transfer
- **Batch Generation**: Generate multiple variations
- **Image Gallery**: Full gallery view with filters
- **Collections**: Save images to collections
- **Sharing**: Share images via link
- **Export Options**: Different formats, sizes

---

## Implementation Checklist

- [ ] Create `contexts/imagen-context.tsx`
- [ ] Create `components/imagen/imagen-generator-view.tsx`
- [ ] Create `components/imagen/imagen-prompt-display.tsx`
- [ ] Create `components/imagen/imagen-generation-status.tsx`
- [ ] Create `components/imagen/imagen-display.tsx`
- [ ] Create `components/imagen/imagen-controls.tsx`
- [ ] Update `app/page.tsx` to include image split view
- [ ] Update tool handler to open image view
- [ ] Update chat interface to show image thumbnails
- [ ] Add image download functionality
- [ ] Add image history (optional)
- [ ] Test responsive behavior
- [ ] Add accessibility features
- [ ] Performance optimization

---

**End of UI Design Document**

