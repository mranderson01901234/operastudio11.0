import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateImage, type ImagenGenerateOptions } from "@/lib/clients/imagen";
import { checkRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { writeImageAtomically } from "@/lib/mcp/file-ops";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const rateLimitResult = await checkRateLimit(userId, ip);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
            ),
            "X-RateLimit-Limit": String(60),
            "X-RateLimit-Remaining": String(rateLimitResult.remaining),
            "X-RateLimit-Reset": String(rateLimitResult.resetAt),
          },
        }
      );
    }

    let body;
    try {
      body = await request.json();
      console.log("[Imagen API] Request body:", JSON.stringify(body, null, 2));
    } catch (jsonError) {
      console.error("[Imagen API] Failed to parse JSON:", jsonError);
      return NextResponse.json(
        { error: "Invalid JSON in request body", details: jsonError instanceof Error ? jsonError.message : "Unknown error" },
        { status: 400 }
      );
    }
    
    const { prompt, aspectRatio, numberOfImages, model } = body;

    console.log("[Imagen API] Extracted values:", {
      prompt: prompt ? `${prompt.substring(0, 50)}...` : prompt,
      promptType: typeof prompt,
      promptLength: prompt?.length,
      aspectRatio,
      numberOfImages,
      model,
    });

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      console.error("[Imagen API] Validation failed: prompt is missing or invalid", { 
        prompt, 
        type: typeof prompt,
        promptLength: prompt?.length,
        fullBody: body
      });
      return NextResponse.json(
        { 
          error: "Prompt is required and must be a non-empty string",
          received: { 
            prompt: prompt || null, 
            promptType: typeof prompt,
            promptLength: prompt?.length,
            fullBody: body
          }
        },
        { status: 400 }
      );
    }

    // Validate prompt length (prevent abuse)
    if (prompt.length > 2000) {
      return NextResponse.json(
        { error: "Prompt must be 2000 characters or less" },
        { status: 400 }
      );
    }

    // Validate aspect ratio
    const validAspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    if (aspectRatio && !validAspectRatios.includes(aspectRatio)) {
      console.error("[Imagen API] Validation failed: invalid aspect ratio", { aspectRatio, validAspectRatios });
      return NextResponse.json(
        { 
          error: `Invalid aspect ratio. Must be one of: ${validAspectRatios.join(", ")}`,
          received: aspectRatio
        },
        { status: 400 }
      );
    }

    // Validate number of images
    const numImages = numberOfImages
      ? Math.min(Math.max(parseInt(String(numberOfImages)), 1), 4)
      : 1;

    // Validate model
    const validModels = ["imagen-4", "imagen-4-ultra", "imagen-4-fast"];
    const selectedModel = model && validModels.includes(model) ? model : "imagen-4";

    const options: ImagenGenerateOptions = {
      prompt: prompt.trim(),
      aspectRatio: aspectRatio as any,
      numberOfImages: numImages,
      model: selectedModel as any,
      safetyFilterLevel: "BLOCK_LOW_AND_ABOVE", // Only supported option for Imagen via Gemini API
      personGeneration: "ALLOW_ADULT", // Default person generation policy
    };

    const startTime = Date.now();
    const result = await generateImage(options);
    const generationTime = Date.now() - startTime;

    // Store images in database
    const storedImages = await Promise.all(
      result.images.map(async (img) => {
        const imageBuffer = Buffer.from(img.bytesBase64Encoded, "base64");
        const imageSize = imageBuffer.length;
        const sourceHash = createHash("sha256")
          .update(imageBuffer)
          .digest("hex");

        // For large images, write to file
        let filePath: string | null = null;
        let data: string | null = img.bytesBase64Encoded;

        if (imageSize >= 1.5 * 1024 * 1024) {
          // Large image: write to file
          const { path } = await writeImageAtomically(
            imageBuffer,
            img.mimeType
          );
          filePath = path;
          data = null; // Don't store base64 for large images
        }

        // Generate previews
        const sharp = (await import("sharp")).default;
        const thumb256 = await sharp(imageBuffer)
          .resize(256, 256, { fit: "inside" })
          .jpeg({ quality: 80 })
          .toBuffer();
        const preview1024 = await sharp(imageBuffer)
          .resize(1024, 1024, { fit: "inside" })
          .jpeg({ quality: 85 })
          .toBuffer();

        return await prisma.generatedImage.create({
          data: {
            userId,
            filePath,
            data,
            mimeType: img.mimeType,
            bytes: imageSize,
            sourceHash,
            outputHash: sourceHash, // Same for original images
            preview256: thumb256.toString("base64"),
            preview1024: preview1024.toString("base64"),
            prompt: options.prompt,
            model: result.model,
            aspectRatio: options.aspectRatio || "1:1",
          },
        });
      })
    );

    return NextResponse.json({
      success: true,
      images: storedImages.map((img) => ({
        id: img.id,
        data: img.data || "", // May be null for large images
        mimeType: img.mimeType,
        filePath: img.filePath,
        preview256: img.preview256,
        preview1024: img.preview1024,
      })),
      model: result.model,
      generationTime,
      metadata: {
        prompt: options.prompt,
        aspectRatio: options.aspectRatio,
        numberOfImages: numImages,
      },
    });
  } catch (error) {
    console.error("[Imagen API] Error generating image:", error);
    
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    
    console.error("[Imagen API] Error message:", errorMessage);
    if (error instanceof Error && error.stack) {
      console.error("[Imagen API] Error stack:", error.stack);
    }

    // Handle specific error types - be more specific about safety filter errors
    // Only treat as safety filter if it's explicitly about safety filtering
    if (errorMessage.includes("Content blocked by safety filter") || 
        errorMessage.includes("safety filter") ||
        (errorMessage.includes("blocked") && (errorMessage.includes("safety") || errorMessage.includes("filter")))) {
      return NextResponse.json(
        {
          error: errorMessage.includes("Content blocked by safety filter") 
            ? errorMessage 
            : "Content blocked by safety filter. Please modify your prompt.",
          code: "SAFETY_FILTER_BLOCKED",
          originalError: errorMessage, // Include original error for debugging
        },
        { status: 400 }
      );
    }

    if (errorMessage.includes("quota") || errorMessage.includes("rate limit") || errorMessage.includes("429")) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again later.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    // Return 500 for unexpected errors, but include the actual error message for debugging
    return NextResponse.json(
      {
        error: "Failed to generate image",
        message: errorMessage,
        // Include full error details in development
        ...(process.env.NODE_ENV === 'development' && {
          details: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          } : error,
        }),
      },
      { status: 500 }
    );
  }
}

