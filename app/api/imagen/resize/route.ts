import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { createAppLogger } from "@/lib/utils/logger";

const logger = createAppLogger("Imagen Resize API");

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { imageId, width, height, maintainAspectRatio = true } = body;

    logger.debug("Resize request:", { imageId, width, height, maintainAspectRatio });

    if (!imageId || !width || !height) {
      return NextResponse.json(
        { error: "Missing required fields: imageId, width, height" },
        { status: 400 }
      );
    }

    // Resolve imageId
    let image;
    if (imageId === "current") {
      image = await prisma.generatedImage.findFirst({
        where: { 
          userId,
          OR: [
            { data: { not: null } },
            { filePath: { not: null } },
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      });
    } else {
      image = await prisma.generatedImage.findFirst({
        where: { id: imageId, userId },
      });
    }

    if (!image || !image.data) {
      return NextResponse.json(
        { error: "Image not found or has no data" },
        { status: 404 }
      );
    }

    try {
      const inputBuffer = Buffer.from(image.data, "base64");
      
      // Resize image
      const fit = maintainAspectRatio ? "inside" : "fill";
      const outputBuffer = await sharp(inputBuffer)
        .resize(Math.floor(width), Math.floor(height), { fit })
        .toBuffer();

      logger.debug("Resize applied successfully");

      // Store edited image
      const editedImage = await prisma.generatedImage.create({
        data: {
          userId,
          data: outputBuffer.toString("base64"),
          mimeType: image.mimeType,
          prompt: image.prompt,
          model: image.model,
          aspectRatio: image.aspectRatio,
          originalImageId: image.id,
          editType: "resize",
          editPrompt: `Resized to ${width}x${height}${maintainAspectRatio ? " (maintaining aspect ratio)" : ""}`,
          bytes: outputBuffer.length,
        },
      });

      return NextResponse.json({
        success: true,
        image: {
          id: editedImage.id,
          data: editedImage.data,
          mimeType: editedImage.mimeType,
          prompt: editedImage.prompt,
          model: editedImage.model,
          aspectRatio: editedImage.aspectRatio,
        },
        metadata: {
          originalImageId: image.id,
          editType: "resize",
        },
      });
    } catch (resizeError) {
      logger.error("Resize processing error:", resizeError);
      return NextResponse.json(
        { error: "Failed to resize image", details: resizeError instanceof Error ? resizeError.message : "Unknown error" },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("Resize API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

