import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { createAppLogger } from "@/lib/utils/logger";

const logger = createAppLogger("Imagen Filter API");

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { imageId, filter, intensity = 50 } = body;

    logger.debug("Filter request:", { imageId, filter, intensity });

    if (!imageId || !filter) {
      return NextResponse.json(
        { error: "Missing required fields: imageId, filter" },
        { status: 400 }
      );
    }

    // Resolve imageId to actual image
    let image;
    if (imageId === "current") {
      // Get most recently created or updated image
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
      logger.debug("Resolved 'current' to image:", image?.id);
    } else {
      image = await prisma.generatedImage.findFirst({
        where: { id: imageId, userId },
      });
      logger.debug("Found image by ID:", image?.id);
    }

    if (!image) {
      logger.warn("Image not found:", { imageId, userId });
      return NextResponse.json(
        { error: `Image not found: ${imageId}` },
        { status: 404 }
      );
    }

    if (!image.data) {
      logger.warn("Image has no data:", { imageId: image.id });
      return NextResponse.json(
        { error: "Image data is missing" },
        { status: 400 }
      );
    }

    try {
      // Apply filter using Sharp
      const inputBuffer = Buffer.from(image.data, "base64");
      let outputBuffer: Buffer;
      let actualFilter = filter.toLowerCase();

      logger.debug("Applying filter:", { filter: actualFilter, intensity });

      switch (actualFilter) {
        case "blur":
          outputBuffer = await sharp(inputBuffer)
            .blur(Math.max(0.3, intensity / 10))
            .toBuffer();
          break;
        case "sharpen":
          outputBuffer = await sharp(inputBuffer)
            .sharpen({ sigma: intensity / 10, flat: 1, jagged: 2 })
            .toBuffer();
          break;
        case "grayscale":
          outputBuffer = await sharp(inputBuffer).greyscale().toBuffer();
          break;
        case "sepia":
          outputBuffer = await sharp(inputBuffer)
            .tint({ r: 112, g: 66, b: 20 })
            .toBuffer();
          break;
        case "negate":
          outputBuffer = await sharp(inputBuffer).negate().toBuffer();
          break;
        case "threshold":
          outputBuffer = await sharp(inputBuffer)
            .threshold(Math.min(255, Math.max(0, intensity)))
            .toBuffer();
          break;
        default:
          return NextResponse.json(
            { error: `Unknown filter: ${filter}. Available: blur, sharpen, grayscale, sepia, negate, threshold` },
            { status: 400 }
          );
      }

      logger.debug("Filter applied successfully");

      // Store edited image in database
      const editedImage = await prisma.generatedImage.create({
        data: {
          userId,
          data: outputBuffer.toString("base64"),
          mimeType: image.mimeType,
          prompt: image.prompt,
          model: image.model,
          aspectRatio: image.aspectRatio,
          originalImageId: image.id,
          editType: "filter",
          editPrompt: `Applied ${actualFilter} filter${intensity !== 50 ? ` with intensity ${intensity}` : ""}`,
          bytes: outputBuffer.length,
        },
      });

      logger.debug("Edited image stored:", editedImage.id);

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
          editType: "filter",
          filter: actualFilter,
          intensity,
        },
      });
    } catch (filterError) {
      logger.error("Filter processing error:", filterError);
      return NextResponse.json(
        { 
          error: "Failed to apply filter", 
          details: filterError instanceof Error ? filterError.message : "Unknown error" 
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("Image filter API error:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

