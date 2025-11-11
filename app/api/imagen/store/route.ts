import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { addEditStep } from "@/lib/imagen/recipe-log";

/**
 * POST /api/imagen/store
 * Store edited image in database with recipe log entry
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      imagePath,
      mimeType,
      originalImageId,
      editType,
      editPrompt,
      sourceHash,
      outputHash,
      toolName,
      toolArguments,
      preview256,
      preview1024,
    } = await request.json();

    if (!imagePath || !originalImageId) {
      return NextResponse.json(
        { error: "imagePath and originalImageId are required" },
        { status: 400 }
      );
    }

    // Read image file
    const imageBuffer = await readFile(imagePath);
    const imageSize = imageBuffer.length;

    // Calculate hash if not provided
    const finalOutputHash =
      outputHash || createHash("sha256").update(imageBuffer).digest("hex");

    // Store image in database
    const storedImage = await prisma.generatedImage.create({
      data: {
        userId,
        filePath: imagePath,
        data: null, // Large images stored as files
        mimeType: mimeType || "image/png",
        bytes: imageSize,
        sourceHash: sourceHash || null,
        outputHash: finalOutputHash,
        preview256: preview256 || null,
        preview1024: preview1024 || null,
        originalImageId,
        editType: editType || null,
        editPrompt: editPrompt || null,
        prompt: "Edited image", // Placeholder
        model: "edited",
        aspectRatio: "1:1",
      },
    });

    // Add recipe log entry if tool info provided
    if (toolName && toolArguments && sourceHash && finalOutputHash) {
      try {
        await addEditStep(
          storedImage.id,
          toolName,
          toolArguments,
          sourceHash,
          finalOutputHash,
          userId
        );
      } catch (recipeError) {
        console.error("[Store Image] Failed to add recipe step:", recipeError);
        // Don't fail the request if recipe log fails
      }
    }

    return NextResponse.json({
      success: true,
      image: {
        id: storedImage.id,
        filePath: storedImage.filePath,
        mimeType: storedImage.mimeType,
        preview256: storedImage.preview256,
        preview1024: storedImage.preview1024,
      },
    });
  } catch (error) {
    console.error("[Store Image] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to store image";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

