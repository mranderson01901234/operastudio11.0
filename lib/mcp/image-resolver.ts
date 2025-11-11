import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, stat } from "fs/promises";
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
  imageId: string;
}

/**
 * Get file extension from MIME type
 */
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

/**
 * Resolve imageId to file path or base64 (for small images)
 * Supports: "current", "img_123", "history[0]"
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
    // For "current", find the most recently created or updated image
    // Try updatedAt first (more recent edits), then createdAt
    // Ensure image has either data (base64) or filePath (file storage)
    image = await prisma.generatedImage.findFirst({
      where: { 
        userId,
        OR: [
          { data: { not: null } },
          { filePath: { not: null } },
        ],
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
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
      where: {
        id: imageId,
        userId, // Security: ensure user owns the image
      },
    });
  }

  if (!image) {
    throw new Error(`IMAGE_NOT_FOUND: Image ${imageId} not found`);
  }

  // If image already has a filePath, use it
  if (image.filePath) {
    try {
      const stats = await stat(image.filePath);
      return {
        path: image.filePath,
        mimeType: image.mimeType,
        size: stats.size,
        hash: image.sourceHash || image.outputHash || "",
        imageId: image.id,
      };
    } catch {
      // File doesn't exist, fall through to create it
    }
  }

  // Calculate size and hash
  const imageData = image.data || "";
  if (!imageData) {
    throw new Error(`IMAGE_DATA_MISSING: Image ${imageId} has no data`);
  }

  const imageBuffer = Buffer.from(imageData, "base64");
  const imageSize = imageBuffer.length;
  const hash = createHash("sha256").update(imageBuffer).digest("hex");

  // For small images, return base64 directly
  if (imageSize < MAX_BASE64_SIZE) {
    return {
      path: "", // Empty path indicates base64
      mimeType: image.mimeType,
      size: imageSize,
      hash,
      base64: imageData,
      imageId: image.id,
    };
  }

  // For large images, write to temp file
  const filePath = join(TEMP_DIR, `${hash}.${getExtension(image.mimeType)}`);

  // Check if file already exists (cached)
  try {
    const stats = await stat(filePath);
    // Update database with filePath if not set
    if (!image.filePath) {
      await prisma.generatedImage.update({
        where: { id: image.id },
        data: { filePath },
      });
    }
    return {
      path: filePath,
      mimeType: image.mimeType,
      size: stats.size,
      hash,
      imageId: image.id,
    };
  } catch {
    // File doesn't exist, write it
    await writeFile(filePath, imageBuffer);

    // Update database with filePath
    await prisma.generatedImage.update({
      where: { id: image.id },
      data: {
        filePath,
        bytes: imageSize,
        sourceHash: hash,
      },
    });

    return {
      path: filePath,
      mimeType: image.mimeType,
      size: imageSize,
      hash,
      imageId: image.id,
    };
  }
}

