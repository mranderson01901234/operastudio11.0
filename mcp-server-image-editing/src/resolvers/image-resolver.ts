/**
 * Resolves imageId to actual image data by calling the resolver API
 * Returns file path or base64 depending on image size
 */
export class ImageResolver {
  private baseUrl: string;

  constructor() {
    // Get API URL from environment or use default
    this.baseUrl =
      process.env.OPERASTUDIO_API_URL || "http://localhost:3000";
  }

  /**
   * Resolve imageId to image data
   * Supports: "current", "img_123", "history[0]"
   * Returns: { path, mimeType, size, hash, base64?, imageId }
   */
  async resolve(imageId: string, actualImageId?: string): Promise<{
    id: string;
    path: string;
    mimeType: string;
    size: number;
    hash: string;
    base64?: string;
  }> {
    // Get userId from environment (set by MCP start route)
    const userId = process.env.USER_ID;
    if (!userId) {
      throw new Error("USER_ID environment variable not set");
    }

    // If actualImageId is provided and imageId is "current", use the actual ID
    const resolvedImageId = (imageId === "current" && actualImageId) ? actualImageId : imageId;

    // Call resolver API with userId query param (for server-to-server calls)
    const url = new URL(`${this.baseUrl}/api/imagen/resolve/${encodeURIComponent(resolvedImageId)}`);
    url.searchParams.set("userId", userId);
    
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const error = await response.json() as { error?: string };
        errorMessage = error.error || errorMessage;
      } catch {
        // Use default error message
      }
      throw new Error(
        `Failed to resolve image ${imageId}: ${errorMessage}`
      );
    }

    const imageData = await response.json() as {
      id: string;
      path: string;
      mimeType: string;
      size: number;
      hash: string;
      base64?: string;
    };
    return imageData;
  }
}

