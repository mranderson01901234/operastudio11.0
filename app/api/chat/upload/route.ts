import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "images");

/**
 * POST /api/chat/upload
 *
 * Upload an image file for use in chat
 *
 * Input: multipart/form-data with 'file' field
 * Output: Image metadata with preview URLs
 * Auth: Clerk session required
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user quota
    const quota = await prisma.userQuota.upsert({
      where: { userId },
      create: {
        userId,
        totalBytes: 0,
        imageCount: 0,
        maxBytes: 104857600, // 100MB
        maxImages: 50,
      },
      update: {},
    });

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          maxSize: MAX_FILE_SIZE,
        },
        { status: 413 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
          allowedTypes: ALLOWED_MIME_TYPES,
        },
        { status: 400 }
      );
    }

    // Check quota - total bytes
    if (quota.totalBytes + file.size > quota.maxBytes) {
      return NextResponse.json(
        {
          error: "Upload quota exceeded",
          currentBytes: quota.totalBytes,
          maxBytes: quota.maxBytes,
          additionalBytes: file.size,
        },
        { status: 507 }
      );
    }

    // Check quota - image count
    if (quota.imageCount >= quota.maxImages) {
      return NextResponse.json(
        {
          error: "Maximum image count reached",
          currentCount: quota.imageCount,
          maxCount: quota.maxImages,
        },
        { status: 507 }
      );
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate and process image with sharp (security: re-encode to strip metadata/malware)
    let image: sharp.Sharp;
    try {
      image = sharp(buffer);
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid image file or corrupted data" },
        { status: 400 }
      );
    }

    // Get image metadata
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return NextResponse.json(
        { error: "Could not read image dimensions" },
        { status: 400 }
      );
    }

    // Generate unique filename
    const imageId = uuidv4();
    const ext = path.extname(file.name) || ".jpg";
    const fileName = `${imageId}${ext}`;
    const userDir = path.join(UPLOAD_DIR, userId);
    const filePath = path.join(userDir, fileName);

    // Ensure directory exists
    await mkdir(userDir, { recursive: true });

    // Save original (re-encoded for security - strips EXIF and potential exploits)
    try {
      await image
        .toFormat(metadata.format || "jpeg", { quality: 90 })
        .toFile(filePath);
    } catch (error) {
      console.error("[Upload] Failed to save image:", error);
      return NextResponse.json(
        { error: "Failed to save image file" },
        { status: 500 }
      );
    }

    // Generate thumbnail (256x256)
    let thumbnail: Buffer;
    try {
      thumbnail = await image
        .clone()
        .resize(256, 256, { fit: "inside", withoutEnlargement: true })
        .toFormat("webp", { quality: 85 })
        .toBuffer();
    } catch (error) {
      console.error("[Upload] Failed to generate thumbnail:", error);
      return NextResponse.json(
        { error: "Failed to generate thumbnail" },
        { status: 500 }
      );
    }

    // Generate preview (1024x1024)
    let preview: Buffer;
    try {
      preview = await image
        .clone()
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .toFormat("webp", { quality: 85 })
        .toBuffer();
    } catch (error) {
      console.error("[Upload] Failed to generate preview:", error);
      return NextResponse.json(
        { error: "Failed to generate preview" },
        { status: 500 }
      );
    }

    // Store in database
    const uploadedImage = await prisma.uploadedImage.create({
      data: {
        id: imageId,
        userId,
        fileName,
        originalName: file.name,
        filePath,
        mimeType: file.type,
        sizeBytes: file.size,
        width: metadata.width,
        height: metadata.height,
        thumbnail: `data:image/webp;base64,${thumbnail.toString("base64")}`,
        preview: `data:image/webp;base64,${preview.toString("base64")}`,
      },
    });

    // Update quota
    await prisma.userQuota.update({
      where: { userId },
      data: {
        totalBytes: { increment: file.size },
        imageCount: { increment: 1 },
      },
    });

    console.log(`[Upload] User ${userId} uploaded image ${imageId} (${file.size} bytes)`);

    // Return image metadata
    return NextResponse.json({
      id: uploadedImage.id,
      fileName: uploadedImage.fileName,
      originalName: uploadedImage.originalName,
      mimeType: uploadedImage.mimeType,
      sizeBytes: uploadedImage.sizeBytes,
      width: uploadedImage.width,
      height: uploadedImage.height,
      thumbnailUrl: uploadedImage.thumbnail,
      previewUrl: uploadedImage.preview,
      fullUrl: `/api/chat/images/${uploadedImage.id}`,
    });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      {
        error: "Upload failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
