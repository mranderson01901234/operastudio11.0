/**
 * Resolves imageId to actual image data by calling the resolver API
 * Returns file path or base64 depending on image size
 */
export declare class ImageResolver {
    private baseUrl;
    constructor();
    /**
     * Resolve imageId to image data
     * Supports: "current", "img_123", "history[0]"
     * Returns: { path, mimeType, size, hash, base64?, imageId }
     */
    resolve(imageId: string, actualImageId?: string): Promise<{
        id: string;
        path: string;
        mimeType: string;
        size: number;
        hash: string;
        base64?: string;
    }>;
}
//# sourceMappingURL=image-resolver.d.ts.map