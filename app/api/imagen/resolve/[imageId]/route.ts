import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { resolveImage } from "@/lib/mcp/image-resolver";

/**
 * GET /api/imagen/resolve/[imageId]
 *
 * Resolves imageId to actual image data for MCP server
 * Supports: "current", "img_123", "history[0]"
 * Returns: file path (for large images) or base64 (for small images)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    let { imageId } = await params;

    // Support both Clerk auth (for browser calls) and userId query param (for MCP server calls)
    let userId: string | null = null;

    // Try Clerk auth first (for browser/client calls)
    const authResult = await auth();
    userId = authResult.userId || null;

    // If no userId from auth, try query param (for MCP server calls)
    if (!userId) {
      const queryUserId = request.nextUrl.searchParams.get("userId");
      if (queryUserId) {
        userId = queryUserId;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized - userId required" }, { status: 401 });
    }

    // If imageId is "current", we need to get it from the query params or resolve it
    // The chat interface should pass the actual imageId, but we support "current" as fallback
    if (imageId === "current") {
      // Try to get from query param first (if passed explicitly)
      const queryImageId = request.nextUrl.searchParams.get("actualImageId");
      if (queryImageId) {
        imageId = queryImageId;
      }
      // Otherwise, resolveImage will handle "current" by finding the most recent image
    }

    // Use the image resolver utility
    const resolved = await resolveImage(imageId, userId);

    // Return resolved image data
    return NextResponse.json({
      id: resolved.imageId,
      path: resolved.path,
      mimeType: resolved.mimeType,
      size: resolved.size,
      hash: resolved.hash,
      base64: resolved.base64, // Only present for small images
    });
  } catch (error) {
    console.error("[Image Resolver] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to resolve image";

    // Parse error codes
    if (errorMessage.includes("IMAGE_NOT_FOUND")) {
      return NextResponse.json(
        { error: errorMessage, code: "IMAGE_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

