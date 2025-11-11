import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { createAppLogger } from "@/lib/utils/logger";

const logger = createAppLogger("Imagen Crop API");

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { imageId, x, y, width, height } = body;

    logger.debug("Crop request:", { imageId, x, y, width, height });

    if (!imageId || x === undefined || y === undefined || !width || !height) {
      return NextResponse.json(
        { error: "Missing required fields: imageId, x, y, width, height" },
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
      
      // Crop image
      const outputBuffer = await sharp(inputBuffer)
        .extract({ left: Math.floor(x), top: Math.floor(y), width: Math.floor(width), height: Math.floor(height) })
        .toBuffer();

      logger.debug("Crop applied successfully");

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
          editType: "crop",
          editPrompt: `Cropped to region (${x}, ${y}) with size ${width}x${height}`,
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
          editType: "crop",
        },
      });
    } catch (cropError) {
      logger.error("Crop processing error:", cropError);
      return NextResponse.json(
        { error: "Failed to crop image", details: cropError instanceof Error ? cropError.message : "Unknown error" },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("Crop API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

