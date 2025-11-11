/**
 * Resolves imageId to actual image data by calling the resolver API
 * Returns file path or base64 depending on image size
 */
export class ImageResolver {
    baseUrl;
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
    async resolve(imageId, actualImageId) {
        // Get userId from environment (set by MCP start route)
        const userId = process.env.USER_ID;
        if (!userId) {
            throw new Error("USER_ID environment variable not set");
        }
        // If actualImageId is provided and imageId is "current", use the actual ID
        const resolvedImageId = (imageId === "current" && actualImageId) ? actualImageId : imageId;
        // Call resolver API
        const url = `${this.baseUrl}/api/imagen/resolve/${encodeURIComponent(resolvedImageId)}`;
        const response = await fetch(url, {
            headers: {
                // Note: In production, you'd need to pass auth token
                // For now, we'll rely on session-based auth via userId in env
                "Content-Type": "application/json",
            },
        });
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            }
            catch {
                // Use default error message
            }
            throw new Error(`Failed to resolve image ${imageId}: ${errorMessage}`);
        }
        const imageData = await response.json();
        return imageData;
    }
}
//# sourceMappingURL=image-resolver.js.map