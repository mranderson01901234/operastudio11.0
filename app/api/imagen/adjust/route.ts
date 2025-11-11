import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { createAppLogger } from "@/lib/utils/logger";

const logger = createAppLogger("Imagen Adjust API");

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { imageId, brightness = 1.0, contrast = 1.0, saturation = 1.0, hue = 0 } = body;

    logger.debug("Adjust request:", { imageId, brightness, contrast, saturation, hue });

    if (!imageId) {
      return NextResponse.json(
        { error: "Missing required field: imageId" },
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
      
      // Adjust image properties
      let sharpInstance = sharp(inputBuffer);

      // Apply brightness, saturation, and hue via modulate
      if (brightness !== 1.0 || saturation !== 1.0 || hue !== 0) {
        sharpInstance = sharpInstance.modulate({
          brightness: brightness,
          saturation: saturation,
          hue: hue,
        });
      }

      // Apply contrast via linear
      if (contrast !== 1.0) {
        const multiplier = contrast;
        const offset = -(128 * (multiplier - 1));
        sharpInstance = sharpInstance.linear(multiplier, offset);
      }

      const outputBuffer = await sharpInstance.toBuffer();

      logger.debug("Adjustments applied successfully");

      const adjustments = [];
      if (brightness !== 1.0) adjustments.push(`brightness=${brightness}`);
      if (contrast !== 1.0) adjustments.push(`contrast=${contrast}`);
      if (saturation !== 1.0) adjustments.push(`saturation=${saturation}`);
      if (hue !== 0) adjustments.push(`hue=${hue}°`);

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
          editType: "adjust",
          editPrompt: `Adjusted: ${adjustments.join(", ")}`,
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
          editType: "adjust",
        },
      });
    } catch (adjustError) {
      logger.error("Adjust processing error:", adjustError);
      return NextResponse.json(
        { error: "Failed to adjust image", details: adjustError instanceof Error ? adjustError.message : "Unknown error" },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("Adjust API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

