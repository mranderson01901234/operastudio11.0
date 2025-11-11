import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { createAppLogger } from "@/lib/utils/logger";

const logger = createAppLogger("Imagen Format API");

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { imageId, format, quality = 80 } = body;

    logger.debug("Format request:", { imageId, format, quality });

    if (!imageId || !format) {
      return NextResponse.json(
        { error: "Missing required fields: imageId, format" },
        { status: 400 }
      );
    }

    const validFormats = ["png", "jpeg", "jpg", "webp", "avif"];
    if (!validFormats.includes(format.toLowerCase())) {
      return NextResponse.json(
        { error: `Invalid format. Must be one of: ${validFormats.join(", ")}` },
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

      // Convert format
      let outputBuffer: Buffer;
      let mimeType: string;

      switch (format.toLowerCase()) {
        case "png":
          outputBuffer = await sharpInstance.png().toBuffer();
          mimeType = "image/png";
          break;
        case "jpeg":
        case "jpg":
          outputBuffer = await sharpInstance.jpeg({ quality }).toBuffer();
          mimeType = "image/jpeg";
          break;
        case "webp":
          outputBuffer = await sharpInstance.webp({ quality }).toBuffer();
          mimeType = "image/webp";
          break;
        case "avif":
          outputBuffer = await sharpInstance.avif({ quality }).toBuffer();
          mimeType = "image/avif";
          break;
        default:
          return NextResponse.json(
            { error: `Unsupported format: ${format}` },
            { status: 400 }
          );
      }

      logger.debug("Format conversion applied successfully");

      // Store edited image
      const editedImage = await prisma.generatedImage.create({
        data: {
          userId,
          data: outputBuffer.toString("base64"),
          mimeType: mimeType,
          prompt: image.prompt,
          model: image.model,
          aspectRatio: image.aspectRatio,
          originalImageId: image.id,
          editType: "format",
          editPrompt: `Converted to ${format.toUpperCase()}${quality !== 80 ? ` with quality ${quality}` : ""}`,
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
          editType: "format",
        },
      });
    } catch (formatError) {
      logger.error("Format processing error:", formatError);
      return NextResponse.json(
        { error: "Failed to convert format", details: formatError instanceof Error ? formatError.message : "Unknown error" },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("Format API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

