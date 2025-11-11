import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { createAppLogger } from "@/lib/utils/logger";

const logger = createAppLogger("Imagen Rotate API");

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { imageId, angle, flip } = body;

    logger.debug("Rotate request:", { imageId, angle, flip });

    if (!imageId) {
      return NextResponse.json(
        { error: "Missing required field: imageId" },
        { status: 400 }
      );
    }

    if (!angle && !flip) {
      return NextResponse.json(
        { error: "Must provide either angle or flip" },
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
      let sharpInstance = sharp(inputBuffer);

      // Apply flip
      if (flip) {
        if (flip === "horizontal" || flip === "both") {
          sharpInstance = sharpInstance.flop();
        }
        if (flip === "vertical" || flip === "both") {
          sharpInstance = sharpInstance.flip();
        }
      }

      // Apply rotation
      if (angle !== undefined) {
        sharpInstance = sharpInstance.rotate(angle);
      }

      const outputBuffer = await sharpInstance.toBuffer();

      logger.debug("Rotate/flip applied successfully");

      const description = angle
        ? `Rotated ${angle} degrees`
        : `Flipped ${flip}`;

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
          editType: "rotate",
          editPrompt: description,
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
          editType: "rotate",
        },
      });
    } catch (rotateError) {
      logger.error("Rotate processing error:", rotateError);
      return NextResponse.json(
        { error: "Failed to rotate image", details: rotateError instanceof Error ? rotateError.message : "Unknown error" },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("Rotate API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

