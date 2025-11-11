import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

/**
 * GET /api/chat/images/[id]
 *
 * Retrieve an uploaded image by ID
 *
 * Returns the original image file with appropriate headers
 * Auth: Clerk session required, user must own the image
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: imageId } = await params;

    if (!imageId) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    // Find image in database
    const image = await prisma.uploadedImage.findFirst({
      where: {
        id: imageId,
        userId, // Security: ensure user owns the image
      },
    });

    if (!image) {
      return NextResponse.json(
        { error: "Image not found" },
        { status: 404 }
      );
    }

    // Check if file exists
    if (!existsSync(image.filePath)) {
      console.error(`[Image Retrieval] File not found: ${image.filePath}`);
      return NextResponse.json(
        { error: "Image file not found on disk" },
        { status: 404 }
      );
    }

    // Read file from disk
    let buffer: Buffer;
    try {
      buffer = await readFile(image.filePath);
    } catch (error) {
      console.error(`[Image Retrieval] Failed to read file: ${image.filePath}`, error);
      return NextResponse.json(
        { error: "Failed to read image file" },
        { status: 500 }
      );
    }

    // Return image with appropriate headers
    return new Response(buffer, {
      headers: {
        "Content-Type": image.mimeType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=31536000, immutable", // Cache for 1 year
        "Content-Disposition": `inline; filename="${image.fileName}"`,
      },
    });
  } catch (error) {
    console.error("[Image Retrieval] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/images/[id]
 *
 * Delete an uploaded image
 *
 * Removes the image from database and disk, updates user quota
 * Auth: Clerk session required, user must own the image
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: imageId } = await params;

    if (!imageId) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    // Find and delete image in a transaction
    const image = await prisma.uploadedImage.findFirst({
      where: {
        id: imageId,
        userId, // Security: ensure user owns the image
      },
    });

    if (!image) {
      return NextResponse.json(
        { error: "Image not found" },
        { status: 404 }
      );
    }

    // Delete from database and update quota in transaction
    await prisma.$transaction([
      prisma.uploadedImage.delete({
        where: { id: imageId },
      }),
      prisma.userQuota.update({
        where: { userId },
        data: {
          totalBytes: { decrement: image.sizeBytes },
          imageCount: { decrement: 1 },
        },
      }),
    ]);

    // Delete file from disk (best effort - don't fail if file missing)
    try {
      const fs = await import("fs/promises");
      if (existsSync(image.filePath)) {
        await fs.unlink(image.filePath);
        console.log(`[Image Delete] Deleted file: ${image.filePath}`);
      }
    } catch (error) {
      console.warn(`[Image Delete] Failed to delete file: ${image.filePath}`, error);
      // Don't fail the request if file deletion fails
    }

    console.log(`[Image Delete] User ${userId} deleted image ${imageId}`);

    return NextResponse.json({
      success: true,
      id: imageId,
    });
  } catch (error) {
    console.error("[Image Delete] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
