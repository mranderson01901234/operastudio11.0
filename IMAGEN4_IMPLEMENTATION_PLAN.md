# Imagen 4 Image Generation Feature - Implementation Plan

**Date:** 2025-01-27  
**Status:** Implementation-Ready  
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Application Audit](#2-current-application-audit)
3. [Imagen 4 API Overview](#3-imagen-4-api-overview)
4. [Architecture Design](#4-architecture-design)
5. [Implementation Details](#5-implementation-details)
6. [Security & Rate Limiting](#6-security--rate-limiting)
7. [Testing Strategy](#7-testing-strategy)
8. [Deployment Considerations](#8-deployment-considerations)
9. [Future Enhancements](#9-future-enhancements)

---

## 1. Executive Summary

This document provides a comprehensive audit of the OperaStudio web application and a detailed implementation plan for integrating Google's Imagen 4 image generation feature. The implementation will allow users to generate images from text prompts directly within the chat interface.

### Key Findings

- **Current Architecture**: Next.js 16 application with modular tool system
- **Integration Pattern**: Follows existing tool-based architecture (email, GitHub, filesystem)
- **API Access**: Imagen 4 available via Gemini API (same credentials)
- **Implementation Complexity**: Medium (similar to existing tool integrations)

### Benefits

- ✅ Seamless integration with existing chat interface
- ✅ Consistent user experience with other tools
- ✅ Leverages existing authentication and rate limiting
- ✅ No additional API credentials required (uses GEMINI_API_KEY)

---

## 2. Current Application Audit

### 2.1 Technology Stack

**Frontend:**
- Next.js 16.0.1 (App Router)
- React 19.2.0
- TypeScript 5
- Tailwind CSS 4
- Clerk for authentication

**Backend:**
- Next.js API Routes (`app/api/*`)
- Prisma ORM (PostgreSQL)
- Server-Sent Events (SSE) for streaming
- Google Gemini API (`@google/genai`)

**Key Dependencies:**
- `@google/genai`: ^1.29.0 (Gemini API client)
- `@clerk/nextjs`: ^6.34.5 (Authentication)
- `@prisma/client`: ^6.19.0 (Database)

### 2.2 Current Architecture Patterns

#### Tool System Architecture

The application uses a modular tool system where tools are:
1. **Defined** in `lib/chat/*-tool-definitions.ts`
2. **Executed** via `lib/chat/tool-handler.ts`
3. **Routed** through API endpoints (`app/api/*`)
4. **Displayed** in chat interface with status indicators

**Existing Tool Categories:**
- **File System Tools** (`FILE_TOOLS`): `fs_read`, `fs_write`, `fs_list`, `fs_delete`, `cmd_execute`
- **Email Tools** (`EMAIL_TOOLS`): `email_list`, `email_send`, `email_reply`, etc.
- **GitHub Tools** (`GITHUB_TOOLS`): `github_list_repos`, `github_read_file`, `github_write_file`, etc.

#### API Route Pattern

```typescript
// Example: app/api/email/send/route.ts
export async function POST(request: NextRequest) {
  const { userId } = await auth(); // Clerk auth
  // ... validation
  // ... business logic
  return NextResponse.json({ success: true, ... });
}
```

#### Tool Handler Pattern

```typescript
// lib/chat/tool-handler.ts
export async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  // Route to appropriate handler
  if (toolCall.name.startsWith("email_")) {
    return executeEmailToolCall(toolCall);
  }
  // ... other handlers
}
```

#### Chat Interface Integration

- Tools are called via function calls from Gemini
- Status indicators show execution progress
- Results are formatted and sent back to LLM
- Images/files can be displayed inline

### 2.3 Current File Structure

```
operastudio-11.0/
├── app/
│   ├── api/
│   │   ├── chat/route.ts          # Main chat endpoint
│   │   ├── email/                 # Email API routes
│   │   ├── github/                # GitHub API routes
│   │   └── mcp/                   # MCP server routes
│   └── ...
├── lib/
│   ├── chat/
│   │   ├── tool-definitions.ts    # File system tools
│   │   ├── email-tool-definitions.ts
│   │   ├── github-tool-definitions.ts
│   │   └── tool-handler.ts        # Tool execution router
│   ├── clients/
│   │   └── gemini.ts              # Gemini API client
│   └── ...
├── components/
│   └── chat/
│       └── chat-interface.tsx      # Main chat UI
└── ...
```

### 2.4 Authentication & Authorization

- **Clerk Authentication**: All API routes require authenticated user
- **Rate Limiting**: Implemented in `lib/rateLimit.ts` (60 requests/minute)
- **User Context**: `userId` extracted from Clerk session

### 2.5 Streaming Architecture

- **SSE Streaming**: Chat responses stream via Server-Sent Events
- **Tool Calls**: Handled recursively with follow-up requests
- **Status Updates**: Real-time tool execution status in UI

---

## 3. Imagen 4 API Overview

### 3.1 API Access

**Endpoint**: Available via Google Gemini API (same `GEMINI_API_KEY`)

**Model Variants**:
- **Imagen 4**: Standard model for general use
- **Imagen 4 Ultra**: Enhanced model for higher fidelity
- **Imagen 4 Fast**: Optimized for speed

**API Documentation**: 
- Available via `@google/genai` SDK
- Uses same authentication as Gemini chat

### 3.2 API Capabilities

**Input Parameters**:
- `prompt`: Text description of desired image
- `aspectRatio`: Image dimensions (e.g., "1:1", "16:9", "9:16")
- `numberOfImages`: Number of images to generate (default: 1)
- `safetyFilterLevel`: Content safety filter (BLOCK_MOST, BLOCK_SOME, BLOCK_ONLY_MOST, BLOCK_NONE)
- `personGeneration`: Control person generation ("ALLOW_ALL", "ALLOW_ADULT", "DONT_ALLOW")

**Output**:
- Base64-encoded image data
- Image metadata (dimensions, format)
- Generation metadata (model used, generation time)

### 3.3 Rate Limits & Costs

- **Rate Limits**: Subject to Gemini API rate limits (same as chat)
- **Costs**: Per-image generation (varies by model variant)
- **Quotas**: Managed via Google Cloud Console

---

## 4. Architecture Design

### 4.1 Integration Approach

**Strategy**: Follow existing tool-based architecture pattern

**Components**:
1. **Tool Definition**: Add `imagen_generate` tool to tool definitions
2. **API Route**: Create `/api/imagen/generate` endpoint
3. **Tool Handler**: Add handler in `tool-handler.ts`
4. **Client Library**: Extend `lib/clients/gemini.ts` or create `lib/clients/imagen.ts`
5. **UI Integration**: Display images inline in chat interface

### 4.2 Data Flow

```
User Prompt → Chat Interface
    ↓
LLM (Gemini) → Function Call: imagen_generate
    ↓
Tool Handler → API Route: /api/imagen/generate
    ↓
Imagen Client → Google Imagen API
    ↓
Response → Base64 Image Data
    ↓
Chat Interface → Display Image Inline
```

### 4.3 Component Structure

```
lib/
├── chat/
│   └── imagen-tool-definitions.ts    # NEW: Imagen tool definition
├── clients/
│   └── imagen.ts                     # NEW: Imagen API client
└── ...

app/
└── api/
    └── imagen/
        └── generate/
            └── route.ts              # NEW: Image generation endpoint

components/
└── chat/
    └── image-display.tsx             # NEW: Image display component
```

---

## 5. Implementation Details

### 5.1 Tool Definition

**File**: `lib/chat/imagen-tool-definitions.ts`

```typescript
import type { ToolDefinition } from "./tool-definitions";

export const IMAGEN_TOOLS: ToolDefinition[] = [
  {
    name: "imagen_generate",
    description: "Generate an image from a text prompt using Google's Imagen 4 model. Use this when the user asks to create, generate, or make an image, picture, photo, illustration, or visual. The tool will create a high-quality image based on the text description provided.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed text description of the image to generate. Be specific about style, composition, colors, mood, and any important details."
        },
        aspectRatio: {
          type: "string",
          description: "Image aspect ratio. Options: '1:1' (square), '16:9' (landscape), '9:16' (portrait), '4:3' (standard), '3:4' (vertical standard). Default: '1:1'"
        },
        numberOfImages: {
          type: "number",
          description: "Number of images to generate (1-4). Default: 1"
        },
        model: {
          type: "string",
          description: "Model variant: 'imagen-4' (standard), 'imagen-4-ultra' (high quality), 'imagen-4-fast' (fast generation). Default: 'imagen-4'"
        }
      },
      required: ["prompt"]
    }
  }
];
```

### 5.2 Imagen Client

**File**: `lib/clients/imagen.ts`

```typescript
import { GoogleGenAI } from "@google/genai";

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  return cachedClient;
}

export interface ImagenGenerateOptions {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  numberOfImages?: number;
  model?: "imagen-4" | "imagen-4-ultra" | "imagen-4-fast";
  safetyFilterLevel?: "BLOCK_MOST" | "BLOCK_SOME" | "BLOCK_ONLY_MOST" | "BLOCK_NONE";
  personGeneration?: "ALLOW_ALL" | "ALLOW_ADULT" | "DONT_ALLOW";
}

export interface ImagenGenerateResult {
  images: Array<{
    bytesBase64Encoded: string;
    mimeType: string;
  }>;
  model: string;
  generationTime?: number;
}

export async function generateImage(
  options: ImagenGenerateOptions
): Promise<ImagenGenerateResult> {
  const client = getClient();
  
  // Use the imagen API endpoint
  // Note: Actual API call structure depends on @google/genai SDK implementation
  // This is a placeholder based on expected API structure
  
  const model = options.model || "imagen-4";
  const aspectRatio = options.aspectRatio || "1:1";
  const numberOfImages = Math.min(Math.max(options.numberOfImages || 1, 1), 4);
  
  try {
    // Call Imagen API via Gemini SDK
    // The exact method name may vary - check @google/genai documentation
    const response = await client.models.generateImage({
      model,
      prompt: options.prompt,
      aspectRatio,
      numberOfImages,
      safetyFilterLevel: options.safetyFilterLevel || "BLOCK_SOME",
      personGeneration: options.personGeneration || "ALLOW_ADULT",
    });
    
    return {
      images: response.images || [],
      model,
      generationTime: response.generationTime,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Imagen generation failed: ${error.message}`);
    }
    throw new Error("Unknown error during image generation");
  }
}
```

**Note**: The actual API method names may differ. Check `@google/genai` SDK documentation for the correct method signatures.

### 5.3 API Route

**File**: `app/api/imagen/generate/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateImage, type ImagenGenerateOptions } from "@/lib/clients/imagen";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const rateLimitResult = await checkRateLimit(userId, ip);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
            ),
            "X-RateLimit-Limit": String(60),
            "X-RateLimit-Remaining": String(rateLimitResult.remaining),
            "X-RateLimit-Reset": String(rateLimitResult.resetAt),
          },
        }
      );
    }

    const body = await request.json();
    const { prompt, aspectRatio, numberOfImages, model } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Validate prompt length (prevent abuse)
    if (prompt.length > 2000) {
      return NextResponse.json(
        { error: "Prompt must be 2000 characters or less" },
        { status: 400 }
      );
    }

    // Validate aspect ratio
    const validAspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    if (aspectRatio && !validAspectRatios.includes(aspectRatio)) {
      return NextResponse.json(
        { error: `Invalid aspect ratio. Must be one of: ${validAspectRatios.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate number of images
    const numImages = numberOfImages
      ? Math.min(Math.max(parseInt(String(numberOfImages)), 1), 4)
      : 1;

    // Validate model
    const validModels = ["imagen-4", "imagen-4-ultra", "imagen-4-fast"];
    const selectedModel = model && validModels.includes(model) ? model : "imagen-4";

    const options: ImagenGenerateOptions = {
      prompt: prompt.trim(),
      aspectRatio: aspectRatio as any,
      numberOfImages: numImages,
      model: selectedModel as any,
      safetyFilterLevel: "BLOCK_SOME", // Default safety filter
      personGeneration: "ALLOW_ADULT", // Default person generation policy
    };

    const startTime = Date.now();
    const result = await generateImage(options);
    const generationTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      images: result.images.map((img) => ({
        data: img.bytesBase64Encoded,
        mimeType: img.mimeType,
      })),
      model: result.model,
      generationTime,
      metadata: {
        prompt: options.prompt,
        aspectRatio: options.aspectRatio,
        numberOfImages: numImages,
      },
    });
  } catch (error) {
    console.error("Error generating image:", error);
    
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    // Handle specific error types
    if (errorMessage.includes("safety") || errorMessage.includes("filter")) {
      return NextResponse.json(
        {
          error: "Content blocked by safety filter. Please modify your prompt.",
          code: "SAFETY_FILTER_BLOCKED",
        },
        { status: 400 }
      );
    }

    if (errorMessage.includes("quota") || errorMessage.includes("rate limit")) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again later.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to generate image",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
```

### 5.4 Tool Handler Integration

**File**: `lib/chat/tool-handler.ts` (add to existing file)

```typescript
// Add to executeToolCall function

/**
 * Execute an Imagen tool call via Imagen API route.
 * @param toolCall The Imagen tool call to execute
 */
async function executeImagenToolCall(toolCall: ToolCall): Promise<ToolResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 120000); // 2 minute timeout (image generation can take longer)

    try {
      const response = await fetch("/api/imagen/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toolCall.arguments),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        let errorMessage = errorData.error || "Image generation failed";

        if (response.status === 400) {
          if (errorData.code === "SAFETY_FILTER_BLOCKED") {
            errorMessage = "Content blocked by safety filter. Please modify your prompt to avoid prohibited content.";
          } else {
            errorMessage = `Invalid request: ${errorMessage}`;
          }
        } else if (response.status === 429) {
          errorMessage = "Rate limit exceeded. Please wait a moment before generating more images.";
        }

        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: errorMessage,
          errorCode: response.status.toString(),
        };
      }

      const result = await response.json();

      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: result,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        throw new Error("Image generation timed out after 2 minutes");
      }
      throw fetchError;
    }
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof TypeError && error.message.includes("fetch")) {
      errorMessage = "Network error: Unable to reach image generation API. Check your connection.";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: errorMessage,
    };
  }
}

// Update executeToolCall function to route imagen tools
export async function executeToolCall(
  toolCall: ToolCall,
  retryCount: number = 0
): Promise<ToolResult> {
  // Route imagen tools to imagen API
  if (toolCall.name.startsWith("imagen_")) {
    return executeImagenToolCall(toolCall);
  }

  // Route email tools to email API
  if (toolCall.name.startsWith("email_")) {
    return executeEmailToolCall(toolCall);
  }

  // Route GitHub tools to GitHub API
  if (toolCall.name.startsWith("github_")) {
    return executeGitHubToolCall(toolCall);
  }

  // ... rest of existing code
}
```

### 5.5 Chat Route Integration

**File**: `app/api/chat/route.ts` (modify existing file)

```typescript
// Add import at top
import { IMAGEN_TOOLS } from "@/lib/chat/imagen-tool-definitions";

// In POST function, add Imagen tools to available tools
const availableTools: ToolDefinition[] = [];

// Add file system tools if MCP session is active
if (hasMCPSession && (body?.enableTools !== false)) {
  availableTools.push(...FILE_TOOLS);
}

// Add email tools if email account is active
if (hasEmailAccount) {
  availableTools.push(...EMAIL_TOOLS);
}

// Add GitHub tools if GitHub account is active
if (hasGitHubAccount) {
  availableTools.push(...GITHUB_TOOLS);
}

// Add Imagen tools (always available)
if (body?.enableTools !== false) {
  availableTools.push(...IMAGEN_TOOLS);
}
```

### 5.6 UI Component for Image Display

**File**: `components/chat/image-display.tsx`

```typescript
"use client";

import { useState } from "react";
import { Download, Maximize2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageDisplayProps {
  imageData: string; // Base64 encoded image
  mimeType?: string;
  prompt?: string;
  model?: string;
}

export function ImageDisplay({
  imageData,
  mimeType = "image/png",
  prompt,
  model,
}: ImageDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      
      // Convert base64 to blob
      const byteCharacters = atob(imageData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `imagen-${Date.now()}.${mimeType.split("/")[1] || "png"}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download image:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const imageUrl = `data:${mimeType};base64,${imageData}`;

  return (
    <div className="relative group">
      <div
        className={`relative overflow-hidden rounded-lg border bg-card ${
          isExpanded ? "max-w-full" : "max-w-md"
        }`}
      >
        <img
          src={imageUrl}
          alt={prompt || "Generated image"}
          className={`w-full h-auto object-contain ${
            isExpanded ? "max-h-[80vh]" : "max-h-96"
          }`}
          loading="lazy"
        />
        
        {/* Overlay controls */}
        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8"
            title={isExpanded ? "Minimize" : "Expand"}
          >
            <Maximize2 className="h-4 w-4" />
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
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Metadata */}
      {(prompt || model) && (
        <div className="mt-2 text-xs text-muted-foreground">
          {prompt && (
            <p className="truncate" title={prompt}>
              Prompt: {prompt}
            </p>
          )}
          {model && <p>Model: {model}</p>}
        </div>
      )}
    </div>
  );
}
```

### 5.7 Chat Interface Integration

**File**: `components/chat/chat-interface.tsx` (modify existing file)

```typescript
// Add import
import { ImageDisplay } from "./image-display";

// In the message rendering section, add image display handling
// After tool call execution, check if result contains images
if (toolCall.name === "imagen_generate" && !result.error && result.result) {
  const imagenResult = result.result as {
    success: boolean;
    images: Array<{ data: string; mimeType: string }>;
    model: string;
    metadata: { prompt: string };
  };

  if (imagenResult.success && imagenResult.images) {
    // Display images inline
    imagenResult.images.forEach((image, index) => {
      // Add image to message content or display separately
      // This depends on your preferred UI pattern
    });
  }
}

// In message display, add image rendering
{message.images && message.images.length > 0 && (
  <div className="mt-2 space-y-2">
    {message.images.map((img, idx) => (
      <ImageDisplay
        key={idx}
        imageData={img.data}
        mimeType={img.mimeType}
        prompt={message.metadata?.prompt}
        model={message.metadata?.model}
      />
    ))}
  </div>
)}
```

**Note**: You'll need to extend the `Message` interface to include images:

```typescript
interface Message {
  id: string;
  content: string;
  role: "assistant" | "user" | "system";
  status?: MessageStatus;
  metadata?: Record<string, unknown>;
  toolCalls?: Array<{...}>;
  images?: Array<{ data: string; mimeType: string }>; // NEW
}
```

---

## 6. Security & Rate Limiting

### 6.1 Content Safety

- **Safety Filters**: Implemented via Imagen API (`safetyFilterLevel`)
- **Default Setting**: `BLOCK_SOME` (balanced approach)
- **Person Generation**: Default `ALLOW_ADULT` (no children)
- **User Override**: Not recommended for production

### 6.2 Rate Limiting

- **Existing System**: Reuse `lib/rateLimit.ts`
- **Image Generation Limit**: Consider separate limit (e.g., 10 images/minute)
- **Cost Management**: Monitor API usage via Google Cloud Console

### 6.3 Input Validation

- **Prompt Length**: Max 2000 characters
- **Prompt Content**: Basic validation (no empty strings)
- **Aspect Ratio**: Whitelist validation
- **Number of Images**: Limited to 1-4 per request

### 6.4 Error Handling

- **Safety Filter Blocks**: Clear error messages
- **Rate Limit Exceeded**: Informative retry guidance
- **API Failures**: Graceful degradation
- **Timeout Handling**: 2-minute timeout for generation

---

## 7. Testing Strategy

### 7.1 Unit Tests

**File**: `__tests__/imagen.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { generateImage } from "@/lib/clients/imagen";

describe("Imagen Client", () => {
  it("should generate image with valid prompt", async () => {
    // Mock API response
    // Test image generation
  });

  it("should handle invalid prompts", async () => {
    // Test error handling
  });

  it("should validate aspect ratios", async () => {
    // Test aspect ratio validation
  });
});
```

### 7.2 Integration Tests

- Test API route with valid/invalid inputs
- Test tool handler routing
- Test image display component
- Test error scenarios

### 7.3 E2E Tests

- User flow: prompt → image generation → display
- Multiple images generation
- Error handling flow
- Rate limiting behavior

---

## 8. Deployment Considerations

### 8.1 Environment Variables

**No new variables required** - uses existing `GEMINI_API_KEY`

### 8.2 API Quotas

- Monitor usage in Google Cloud Console
- Set up billing alerts
- Consider implementing per-user quotas

### 8.3 Performance

- **Image Size**: Base64 encoding increases size ~33%
- **Storage**: Consider caching frequently requested images
- **CDN**: May want to serve images via CDN for better performance

### 8.4 Monitoring

- Track generation success/failure rates
- Monitor generation times
- Track safety filter blocks
- Monitor API costs

---

## 9. Future Enhancements

### 9.1 Image Editing

- Image-to-image generation
- Inpainting capabilities
- Style transfer

### 9.2 Image Management

- Image history/gallery
- Favorite images
- Image sharing

### 9.3 Advanced Features

- Batch generation
- Custom model fine-tuning
- Image variations
- Prompt templates

### 9.4 UI Improvements

- Image grid view
- Image comparison
- Prompt suggestions
- Style presets

---

## Implementation Checklist

- [ ] Create `lib/chat/imagen-tool-definitions.ts`
- [ ] Create `lib/clients/imagen.ts`
- [ ] Create `app/api/imagen/generate/route.ts`
- [ ] Update `lib/chat/tool-handler.ts` to route imagen tools
- [ ] Update `app/api/chat/route.ts` to include IMAGEN_TOOLS
- [ ] Create `components/chat/image-display.tsx`
- [ ] Update `components/chat/chat-interface.tsx` to display images
- [ ] Add tests for imagen functionality
- [ ] Update rate limiting if needed
- [ ] Test end-to-end flow
- [ ] Document API usage
- [ ] Deploy and monitor

---

## Notes

1. **API Method Names**: The actual method names in `@google/genai` SDK may differ. Check the latest SDK documentation.

2. **Base64 Handling**: Consider streaming large images or using blob URLs for better performance.

3. **Error Messages**: Provide user-friendly error messages for common scenarios (safety blocks, rate limits).

4. **Image Caching**: Consider implementing client-side caching for generated images to reduce API calls.

5. **Accessibility**: Ensure image display component is accessible (alt text, keyboard navigation).

---

**End of Implementation Plan**

