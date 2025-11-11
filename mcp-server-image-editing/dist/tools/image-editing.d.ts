export interface AdjustOptions {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    hue?: number;
}
export declare class ImageEditingTools {
    /**
     * Load image from path or base64
     */
    private loadImage;
    /**
     * Crop image to specific region
     */
    crop(imageBuffer: Buffer, x: number, y: number, width: number, height: number): Promise<Buffer>;
    /**
     * Resize image
     */
    resize(imageBuffer: Buffer, width: number, height: number, maintainAspectRatio?: boolean): Promise<Buffer>;
    /**
     * Adjust image properties
     */
    adjust(imageBuffer: Buffer, options: AdjustOptions): Promise<Buffer>;
    /**
     * Apply filter
     */
    applyFilter(imageBuffer: Buffer, filter: string, intensity: number): Promise<Buffer>;
    /**
     * Rotate or flip image
     */
    rotate(imageBuffer: Buffer, angle?: number, flip?: string): Promise<Buffer>;
    /**
     * Convert format
     */
    convertFormat(imageBuffer: Buffer, format: string, quality?: number): Promise<Buffer>;
    /**
     * Get MIME type for format
     */
    getMimeTypeForFormat(format: string): string;
    /**
     * Generate preview thumbnails (256px, 1024px)
     */
    generatePreviews(imageBuffer: Buffer): Promise<{
        preview256: string;
        preview1024: string;
    }>;
    /**
     * Calculate hash of image buffer
     */
    calculateHash(buffer: Buffer): string;
}
//# sourceMappingURL=image-editing.d.ts.map