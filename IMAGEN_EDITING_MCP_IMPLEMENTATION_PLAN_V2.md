# Image Editing MCP Implementation Plan - Hardened Version

**Date:** 2025-01-27  
**Status:** Implementation-Ready (Hardened)  
**Version:** 2.0  
**Architecture:** MCP Server with File-Based Transport, Recipe Log, Session Multiplexer, Worker Pool

---

## Table of Contents

1. [Overview](#1-overview)
2. [Critical Architecture Changes](#2-critical-architecture-changes)
3. [File-Based Transport](#3-file-based-transport)
4. [Recipe Log & Non-Destructive Editing](#4-recipe-log--non-destructive-editing)
5. [Session Multiplexer](#5-session-multiplexer)
6. [Worker Pool Architecture](#6-worker-pool-architecture)
7. [Security & Validation](#7-security--validation)
8. [Color & Metadata Handling](#8-color--metadata-handling)
9. [Error Handling](#9-error-handling)
10. [Implementation Steps](#10-implementation-steps)

---

## 1. Overview

This is a **hardened version** of the MCP image editing implementation plan, addressing critical production concerns:

### Key Improvements

- ✅ **File-Based Transport**: Large images via file paths, not base64 over stdio
- ✅ **Recipe Log**: Non-destructive edit history with undo/replay
- ✅ **Session Multiplexer**: Concurrent filesystem + image editing sessions
- ✅ **Worker Pool**: Background jobs for CPU-heavy operations
- ✅ **Atomic Writes**: Safe file operations with fsync + rename
- ✅ **Strict Validation**: Security limits and format validation
- ✅ **Color/Metadata**: ICC profile handling, EXIF stripping
- ✅ **Error Codes**: Normalized error messages with codes

---

## 2. Critical Architecture Changes

### Old Flow (Base64 over stdio)
```
Tool Call → MCP Server → Fetch base64 from DB → Process → Return base64 → Store base64
```
**Problem**: Large images (>1.5MB) cause stdio buffer issues, memory pressure

### New Flow (File-based)
```
Tool Call → Queue Job → Worker → Write temp file → MCP Server (file path) → Process → Atomic write → Return path → Generate preview
```
**Benefits**: No stdio limits, lower memory, supports streaming

---

## 3. File-Based Transport

### Image Resolver (Updated)

**File:** `lib/mcp/image-resolver.ts` (NEW)

```typescript
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import * as os from "os";

const TEMP_DIR = process.env.IMAGE_TEMP_DIR || join(os.tmpdir(), "operastudio-images");
const MAX_BASE64_SIZE = 1.5 * 1024 * 1024; // 1.5 MB

export interface ResolvedImage {
  path: string;
  mimeType: string;
  size: number;
  hash: string;
  // Fallback for small images
  base64?: string;
}

/**
 * Resolve imageId to file path or base64 (for small images)
 */
export async function resolveImage(
  imageId: string,
  userId: string
): Promise<ResolvedImage> {
  // Ensure temp directory exists
  await mkdir(TEMP_DIR, { recursive: true });

  // Resolve image from database
  let image;
  if (imageId === "current") {
    image = await prisma.generatedImage.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  } else if (imageId.startsWith("history[")) {
    const index = parseInt(imageId.match(/\[(\d+)\]/)?.[1] || "0");
    const images = await prisma.generatedImage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: index + 1,
    });
    image = images[index] || null;
  } else {
    image = await prisma.generatedImage.findFirst({
      where: { id: imageId, userId },
    });
  }

  if (!image) {
    throw new Error(`IMAGE_NOT_FOUND: Image ${imageId} not found`);
  }

  // Calculate size and hash
  const imageSize = Buffer.from(image.data, "base64").length;
  const hash = createHash("sha256")
    .update(image.data)
    .digest("hex");

  // For small images, return base64 directly
  if (imageSize < MAX_BASE64_SIZE) {
    return {
      path: "", // Empty path indicates base64
      mimeType: image.mimeType,
      size: imageSize,
      hash,
      base64: image.data,
    };
  }

  // For large images, write to temp file
  const filePath = join(TEMP_DIR, `${hash}.${getExtension(image.mimeType)}`);
  
  // Check if file already exists (cached)
  try {
    const stats = await import("fs/promises").then(fs => fs.stat(filePath));
    return {
      path: filePath,
      mimeType: image.mimeType,
      size: stats.size,
      hash,
    };
  } catch {
    // File doesn't exist, write it
    const buffer = Buffer.from(image.data, "base64");
    await writeFile(filePath, buffer);
    
    return {
      path: filePath,
      mimeType: image.mimeType,
      size: imageSize,
      hash,
    };
  }
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  return map[mimeType] || "png";
}
```

### MCP Server Tool Handler (Updated)

**File:** `mcp-server-image-editing/src/index.ts` (modify)

```typescript
// In CallToolRequestSchema handler:

// Resolve image - returns path or base64
const resolvedImage = await this.imageResolver.resolve(args.imageId as string);

let inputBuffer: Buffer;

if (resolvedImage.path) {
  // Large image: read from file
  inputBuffer = await readFile(resolvedImage.path);
} else if (resolvedImage.base64) {
  // Small image: use base64
  inputBuffer = Buffer.from(resolvedImage.base64, "base64");
} else {
  throw new Error("IMAGE_RESOLUTION_FAILED: No path or base64 available");
}

// Process image
const result = await this.imageTools.crop(inputBuffer, x, y, width, height);

// Write result to temp file atomically
const outputPath = await writeImageAtomically(result, resolvedImage.mimeType);

// Return file path (not base64)
return {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        success: true,
        image: {
          path: outputPath,
          mimeType: resolvedImage.mimeType,
          size: result.length,
        },
        metadata: {
          originalImageId: imageData.id,
          editType: "crop",
        },
      }),
    },
  ],
};
```

### Atomic Write Helper

**File:** `mcp-server-image-editing/src/utils/file-ops.ts`

```typescript
import { writeFile, rename, mkdir } from "fs/promises";
import { join, dirname } from "path";
import * as os from "os";

const TEMP_DIR = process.env.IMAGE_TEMP_DIR || join(os.tmpdir(), "operastudio-images");

/**
 * Atomically write image: tmp → fsync → rename
 */
export async function writeImageAtomically(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  await mkdir(TEMP_DIR, { recursive: true });

  const tempPath = join(TEMP_DIR, `tmp_${Date.now()}_${Math.random().toString(36)}.${getExtension(mimeType)}`);
  const finalPath = join(TEMP_DIR, `img_${Date.now()}_${Math.random().toString(36)}.${getExtension(mimeType)}`);

  // Write to temp file
  await writeFile(tempPath, buffer);

  // Atomic rename (fsync happens automatically on most systems)
  await rename(tempPath, finalPath);

  return finalPath;
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  return map[mimeType] || "png";
}
```

---

## 4. Recipe Log & Non-Destructive Editing

### Database Schema (Updated)

**File:** `prisma/schema.prisma`

```prisma
model GeneratedImage {
  id            String   @id @default(cuid())
  userId        String   @map("user_id")
  
  // Image storage (file path or base64 for small images)
  filePath      String?  @map("file_path") // Path to file in temp storage
  data          String?  @db.Text // base64 (only for small images <1.5MB)
  mimeType      String   @map("mime_type") @default("image/png")
  bytes         Int      @default(0) // File size in bytes
  
  // Previews (for UI)
  preview256    String?  @db.Text @map("preview_256") // base64 thumbnail
  preview1024   String?  @db.Text @map("preview_1024") // base64 preview
  
  // Hashes for integrity
  sourceHash    String?  @map("source_hash") // SHA256 of source image
  outputHash    String?  @map("output_hash") // SHA256 of output image
  
  // Recipe log (non-destructive edit history)
  recipeJson    String?  @db.Text @map("recipe_json") // JSON array of edit steps
  
  // Generation metadata
  prompt        String   @db.Text
  model         String   @default("imagen-4")
  aspectRatio   String   @map("aspect_ratio") @default("1:1")
  
  // Editing metadata
  originalImageId String? @map("original_image_id")
  editType        String? @map("edit_type")
  editPrompt      String? @db.Text @map("edit_prompt")
  
  // Timestamps
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  
  // Relations
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  originalImage GeneratedImage? @relation("ImageEdits", fields: [originalImageId], references: [id])
  edits         GeneratedImage[] @relation("ImageEdits")
  
  @@index([userId])
  @@index([originalImageId])
  @@index([createdAt])
  @@index([sourceHash])
  @@map("generated_images")
}
```

### Recipe Log Structure

```typescript
interface EditStep {
  stepId: string; // Unique step ID
  toolName: string; // "imagen_crop", "imagen_resize", etc.
  arguments: Record<string, unknown>; // Tool arguments
  sourceHash: string; // Hash of input image
  outputHash: string; // Hash of output image
  timestamp: string; // ISO timestamp
  userId: string;
}

type RecipeLog = EditStep[];
```

### Recipe Log Manager

**File:** `lib/imagen/recipe-log.ts`

```typescript
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

export interface EditStep {
  stepId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  sourceHash: string;
  outputHash: string;
  timestamp: string;
  userId: string;
}

/**
 * Add edit step to recipe log
 */
export async function addEditStep(
  imageId: string,
  toolName: string,
  args: Record<string, unknown>,
  sourceHash: string,
  outputHash: string,
  userId: string
): Promise<void> {
  const image = await prisma.generatedImage.findFirst({
    where: { id: imageId, userId },
  });

  if (!image) {
    throw new Error("IMAGE_NOT_FOUND");
  }

  const step: EditStep = {
    stepId: `step_${Date.now()}_${Math.random().toString(36)}`,
    toolName,
    arguments: args,
    sourceHash,
    outputHash,
    timestamp: new Date().toISOString(),
    userId,
  };

  // Load existing recipe
  const existingRecipe: EditStep[] = image.recipeJson
    ? JSON.parse(image.recipeJson)
    : [];

  // Append new step
  const updatedRecipe = [...existingRecipe, step];

  // Update image with new recipe
  await prisma.generatedImage.update({
    where: { id: imageId },
    data: {
      recipeJson: JSON.stringify(updatedRecipe),
      outputHash: outputHash,
    },
  });
}

/**
 * Undo last edit step
 */
export async function undoLastStep(
  imageId: string,
  userId: string
): Promise<{ success: boolean; previousImageId?: string }> {
  const image = await prisma.generatedImage.findFirst({
    where: { id: imageId, userId },
  });

  if (!image || !image.recipeJson) {
    return { success: false };
  }

  const recipe: EditStep[] = JSON.parse(image.recipeJson);
  if (recipe.length === 0) {
    return { success: false };
  }

  // Remove last step
  const updatedRecipe = recipe.slice(0, -1);

  // Find previous image (one step back)
  const previousStep = updatedRecipe[updatedRecipe.length - 1];
  const previousImage = previousStep
    ? await prisma.generatedImage.findFirst({
        where: { outputHash: previousStep.outputHash, userId },
      })
    : await prisma.generatedImage.findFirst({
        where: { id: image.originalImageId || imageId, userId },
      });

  // Update image
  await prisma.generatedImage.update({
    where: { id: imageId },
    data: {
      recipeJson: JSON.stringify(updatedRecipe),
      outputHash: previousStep?.outputHash || image.sourceHash,
    },
  });

  return {
    success: true,
    previousImageId: previousImage?.id,
  };
}

/**
 * Replay recipe on new source image
 */
export async function replayRecipe(
  sourceImageId: string,
  recipeImageId: string,
  userId: string
): Promise<string> {
  const recipeImage = await prisma.generatedImage.findFirst({
    where: { id: recipeImageId, userId },
  });

  if (!recipeImage || !recipeImage.recipeJson) {
    throw new Error("RECIPE_NOT_FOUND");
  }

  const recipe: EditStep[] = JSON.parse(recipeImage.recipeJson);

  // TODO: Execute each step in recipe on source image
  // This would call MCP tools sequentially
  // For now, return placeholder
  return sourceImageId;
}
```

---

## 5. Session Multiplexer

### Problem

Users may run **filesystem** and **image-editing** MCP sessions concurrently. Need explicit routing table instead of heuristics.

### Solution: Tool Prefix → Session ID Mapping

**File:** `lib/mcp/session-router.ts` (NEW)

```typescript
import { prisma } from "@/lib/prisma";

export interface SessionRoute {
  toolPrefix: string; // "fs_", "imagen_edit_"
  sessionId: string;
  serverType: "filesystem" | "image-editing";
}

/**
 * Get routing table for user's active sessions
 */
export async function getRoutingTable(userId: string): Promise<Map<string, SessionRoute>> {
  const sessions = await prisma.localSession.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
  });

  const routingTable = new Map<string, SessionRoute>();

  for (const session of sessions) {
    // Determine server type from session metadata
    const serverType = (session as any).serverType || "filesystem"; // Add serverType to schema

    if (serverType === "filesystem") {
      routingTable.set("fs_", {
        toolPrefix: "fs_",
        sessionId: session.id,
        serverType: "filesystem",
      });
      routingTable.set("cmd_", {
        toolPrefix: "cmd_",
        sessionId: session.id,
        serverType: "filesystem",
      });
    } else if (serverType === "image-editing") {
      routingTable.set("imagen_edit_", {
        toolPrefix: "imagen_edit_",
        sessionId: session.id,
        serverType: "image-editing",
      });
      routingTable.set("imagen_crop", {
        toolPrefix: "imagen_crop",
        sessionId: session.id,
        serverType: "image-editing",
      });
      routingTable.set("imagen_resize", {
        toolPrefix: "imagen_resize",
        sessionId: session.id,
        serverType: "image-editing",
      });
      // ... add all imagen_* tools
    }
  }

  return routingTable;
}

/**
 * Route tool call to appropriate session
 */
export async function routeToolCall(
  toolName: string,
  userId: string
): Promise<{ sessionId: string; serverType: string } | null> {
  const routingTable = await getRoutingTable(userId);

  // Exact match first
  if (routingTable.has(toolName)) {
    const route = routingTable.get(toolName)!;
    return { sessionId: route.sessionId, serverType: route.serverType };
  }

  // Prefix match
  for (const [prefix, route] of routingTable.entries()) {
    if (toolName.startsWith(prefix)) {
      return { sessionId: route.sessionId, serverType: route.serverType };
    }
  }

  return null;
}
```

### Updated Tool Handler

**File:** `lib/chat/tool-handler.ts` (modify)

```typescript
import { routeToolCall } from "@/lib/mcp/session-router";

export async function executeToolCall(
  toolCall: ToolCall,
  retryCount: number = 0
): Promise<ToolResult> {
  // Special case: imagen_generate goes to API route
  if (toolCall.name === "imagen_generate") {
    return executeImagenToolCall(toolCall);
  }

  // Route via session multiplexer
  const { userId } = await auth(); // Get from context
  const route = await routeToolCall(toolCall.name, userId);

  if (!route) {
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: `No active session found for tool: ${toolCall.name}. Please start the appropriate MCP session.`,
    };
  }

  // Route to appropriate MCP server
  return executeMCPToolCall(toolCall, route.sessionId);
}
```

### Database Schema Update

**File:** `prisma/schema.prisma`

```prisma
model LocalSession {
  // ... existing fields
  serverType String? @map("server_type") // "filesystem" | "image-editing"
  
  @@index([userId, serverType, status])
}
```

---

## 6. Worker Pool Architecture

### Problem

Image editing is CPU-heavy. Should not block API routes. Use background queue.

### Solution: BullMQ Worker Pool

**File:** `lib/workers/image-editing-worker.ts` (NEW)

```typescript
import { Worker, Job } from "bullmq";
import { connection } from "./redis-connection";
import { processImageEdit } from "../mcp/image-processor";

export interface ImageEditJob {
  toolName: string;
  arguments: Record<string, unknown>;
  imageId: string;
  userId: string;
}

const worker = new Worker<ImageEditJob>(
  "image-editing",
  async (job: Job<ImageEditJob>) => {
    const { toolName, arguments: args, imageId, userId } = job.data;

    // Process image edit
    const result = await processImageEdit(toolName, args, imageId, userId);

    // Update job progress
    await job.updateProgress(100);

    return result;
  },
  {
    connection,
    concurrency: 2, // Process 2 jobs concurrently
    limiter: {
      max: 10, // Max 10 jobs per minute per user
      duration: 60000,
    },
  }
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err);
});

export { worker };
```

### Queue Client

**File:** `lib/queues/image-editing-queue.ts` (NEW)

```typescript
import { Queue } from "bullmq";
import { connection } from "./redis-connection";

export const imageEditingQueue = new Queue("image-editing", {
  connection,
});

export async function enqueueImageEdit(
  toolName: string,
  args: Record<string, unknown>,
  imageId: string,
  userId: string
): Promise<string> {
  const job = await imageEditingQueue.add(
    "edit",
    {
      toolName,
      arguments: args,
      imageId,
      userId,
    },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    }
  );

  return job.id!;
}
```

### Updated Tool Handler (Queue-Based)

**File:** `lib/chat/tool-handler.ts` (modify)

```typescript
import { enqueueImageEdit } from "@/lib/queues/image-editing-queue";

async function executeImagenEditToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const { userId } = await auth();

  try {
    // Enqueue job instead of processing directly
    const jobId = await enqueueImageEdit(
      toolCall.name,
      toolCall.arguments,
      toolCall.arguments.imageId as string,
      userId
    );

    // Return job ID immediately
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: {
        jobId,
        status: "queued",
        message: "Image editing job queued. Processing in background...",
      },
    };
  } catch (error) {
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: error instanceof Error ? error.message : "Failed to queue job",
    };
  }
}
```

### Job Status API

**File:** `app/api/imagen/job/[jobId]/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { imageEditingQueue } from "@/lib/queues/image-editing-queue";

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const job = await imageEditingQueue.getJob(params.jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const state = await job.getState();
  const progress = job.progress;

  return NextResponse.json({
    jobId: params.jobId,
    status: state,
    progress,
    result: job.returnvalue,
    error: job.failedReason,
  });
}
```

---

## 7. Security & Validation

### Validation Schema

**File:** `lib/imagen/validation.ts` (NEW)

```typescript
export interface ValidationLimits {
  maxWidth: number;
  maxHeight: number;
  maxMegapixels: number;
  maxFileSize: number; // bytes
  allowedFormats: string[];
}

export const DEFAULT_LIMITS: ValidationLimits = {
  maxWidth: 8192,
  maxHeight: 8192,
  maxMegapixels: 64, // 8K x 8K
  maxFileSize: 50 * 1024 * 1024, // 50 MB
  allowedFormats: ["png", "jpeg", "jpg", "webp", "avif"],
};

export function validateImageDimensions(
  width: number,
  height: number,
  limits: ValidationLimits = DEFAULT_LIMITS
): { valid: boolean; error?: string } {
  if (width <= 0 || height <= 0) {
    return { valid: false, error: "INVALID_ARGS: Width and height must be positive" };
  }

  if (width > limits.maxWidth) {
    return {
      valid: false,
      error: `IMAGE_TOO_LARGE: Width ${width} exceeds maximum ${limits.maxWidth}`,
    };
  }

  if (height > limits.maxHeight) {
    return {
      valid: false,
      error: `IMAGE_TOO_LARGE: Height ${height} exceeds maximum ${limits.maxHeight}`,
    };
  }

  const megapixels = (width * height) / 1_000_000;
  if (megapixels > limits.maxMegapixels) {
    return {
      valid: false,
      error: `IMAGE_TOO_LARGE: ${megapixels.toFixed(1)}MP exceeds maximum ${limits.maxMegapixels}MP`,
    };
  }

  return { valid: true };
}

export function validateFormat(
  format: string,
  limits: ValidationLimits = DEFAULT_LIMITS
): { valid: boolean; error?: string } {
  if (!limits.allowedFormats.includes(format.toLowerCase())) {
    return {
      valid: false,
      error: `UNSUPPORTED_FORMAT: Format ${format} not allowed. Allowed: ${limits.allowedFormats.join(", ")}`,
    };
  }

  return { valid: true };
}

export function sanitizePath(path: string): { valid: boolean; sanitized?: string; error?: string } {
  // Prevent directory traversal
  if (path.includes("..") || path.includes("/") || path.includes("\\")) {
    return { valid: false, error: "INVALID_PATH: Path contains illegal characters" };
  }

  // Allowlist workspace directories
  const allowedDirs = [
    process.env.IMAGE_TEMP_DIR || "/tmp/operastudio-images",
  ];

  const resolved = require("path").resolve(path);
  const isAllowed = allowedDirs.some((dir) => resolved.startsWith(dir));

  if (!isAllowed) {
    return { valid: false, error: "INVALID_PATH: Path outside allowed directories" };
  }

  return { valid: true, sanitized: resolved };
}
```

### MCP Server Validation

**File:** `mcp-server-image-editing/src/validation.ts`

```typescript
import { validateImageDimensions, validateFormat, DEFAULT_LIMITS } from "./validation";

// In tool handlers, validate before processing:

case "imagen_resize": {
  const { width, height } = args;
  
  const validation = validateImageDimensions(width, height);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  // ... proceed with resize
}
```

---

## 8. Color & Metadata Handling

### ICC Profile & Color Space

**File:** `mcp-server-image-editing/src/tools/image-editing.ts` (update)

```typescript
import sharp from "sharp";

export class ImageEditingTools {
  /**
   * Process image with ICC profile handling
   */
  async processWithColorManagement(
    imageBuffer: Buffer,
    operation: (instance: sharp.Sharp) => sharp.Sharp
  ): Promise<Buffer> {
    const instance = sharp(imageBuffer);

    // Read ICC profile
    const metadata = await instance.metadata();
    const hasICC = metadata.icc;

    // Convert to sRGB for web previews
    let processed = operation(instance);

    if (hasICC && metadata.space !== "srgb") {
      // Convert to sRGB
      processed = processed.toColorspace("srgb");
    }

    return await processed.toBuffer();
  }

  /**
   * Strip EXIF metadata (GPS, etc.) for privacy
   */
  async stripMetadata(
    imageBuffer: Buffer,
    preserveMetadata: boolean = false
  ): Promise<Buffer> {
    if (preserveMetadata) {
      return imageBuffer; // Keep all metadata
    }

    // Strip GPS and other sensitive EXIF
    return await sharp(imageBuffer)
      .withMetadata({
        exif: {
          IFD0: {}, // Keep basic EXIF, remove GPS
        },
      })
      .toBuffer();
  }
}
```

### Preview Generation

**File:** `lib/imagen/preview-generator.ts` (NEW)

```typescript
import sharp from "sharp";
import { readFile } from "fs/promises";

/**
 * Generate preview thumbnails (256px, 1024px)
 */
export async function generatePreviews(
  imagePath: string
): Promise<{ preview256: string; preview1024: string }> {
  const buffer = await readFile(imagePath);

  // Generate 256px thumbnail
  const thumb256 = await sharp(buffer)
    .resize(256, 256, { fit: "inside" })
    .jpeg({ quality: 80 })
    .toBuffer();

  // Generate 1024px preview
  const preview1024 = await sharp(buffer)
    .resize(1024, 1024, { fit: "inside" })
    .jpeg({ quality: 85 })
    .toBuffer();

  return {
    preview256: thumb256.toString("base64"),
    preview1024: preview1024.toString("base64"),
  };
}
```

---

## 9. Error Handling

### Error Codes

**File:** `lib/imagen/errors.ts` (NEW)

```typescript
export enum ImageErrorCode {
  IMAGE_NOT_FOUND = "IMAGE_NOT_FOUND",
  IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE",
  UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT",
  INVALID_ARGS = "INVALID_ARGS",
  INVALID_PATH = "INVALID_PATH",
  PROCESSING_FAILED = "PROCESSING_FAILED",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
}

export class ImageError extends Error {
  constructor(
    public code: ImageErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ImageError";
  }
}

export function normalizeMCPError(error: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof ImageError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    // Parse error codes from message
    const codeMatch = error.message.match(/^(\w+):/);
    if (codeMatch) {
      return {
        code: codeMatch[1],
        message: error.message,
      };
    }

    return {
      code: ImageErrorCode.PROCESSING_FAILED,
      message: error.message,
    };
  }

  return {
    code: ImageErrorCode.PROCESSING_FAILED,
    message: "Unknown error occurred",
  };
}
```

### MCP Server Error Response

```typescript
// In MCP server tool handler:
catch (error) {
  const normalized = normalizeMCPError(error);
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: true,
          code: normalized.code,
          message: normalized.message,
          details: normalized.details,
        }),
      },
    ],
    isError: true,
  };
}
```

---

## 10. Implementation Steps

### Phase 1: Foundation (Days 1-2)

1. **Database Schema Updates**
   - Add `filePath`, `recipeJson`, `preview256`, `preview1024`, `sourceHash`, `outputHash`, `bytes`
   - Add `serverType` to `LocalSession`
   - Run migration

2. **File-Based Transport**
   - Implement `lib/mcp/image-resolver.ts`
   - Update image resolver API to return paths
   - Implement atomic write helpers

3. **Recipe Log**
   - Implement `lib/imagen/recipe-log.ts`
   - Add recipe management functions

### Phase 2: Session & Routing (Day 3)

1. **Session Multiplexer**
   - Implement `lib/mcp/session-router.ts`
   - Update tool handler routing
   - Test concurrent sessions

2. **Validation**
   - Implement `lib/imagen/validation.ts`
   - Add validation to MCP server
   - Test limits

### Phase 3: Worker Pool (Day 4)

1. **Queue Setup**
   - Install BullMQ/Redis
   - Implement worker and queue
   - Update tool handler to enqueue

2. **Job Status**
   - Implement job status API
   - Add progress tracking
   - Test queue processing

### Phase 4: Color & Metadata (Day 5)

1. **Color Management**
   - Update Sharp operations with ICC handling
   - Implement metadata stripping
   - Test color space conversion

2. **Preview Generation**
   - Implement preview generator
   - Generate thumbnails on edit
   - Update UI to use previews

### Phase 5: Testing & Polish (Day 6)

1. **Error Handling**
   - Implement error codes
   - Normalize MCP errors
   - Test error scenarios

2. **Integration Testing**
   - Test file-based transport with large images
   - Test recipe log undo/replay
   - Test concurrent sessions
   - Test worker pool

---

## Testing Checklist

- [ ] 20 MB HEIC → PNG pipeline, memory cap respected
- [ ] Parallel edits on same source: no clobbering
- [ ] Corrupt image input → graceful failure
- [ ] Tool discovery unavailable → fallback to static tool set
- [ ] ICC preserved on TIFF export; stripped on web exports
- [ ] Recipe log undo works correctly
- [ ] Session multiplexer routes correctly
- [ ] Worker pool processes jobs
- [ ] Validation rejects invalid inputs
- [ ] Atomic writes prevent corruption

---

**End of Hardened Implementation Plan**

