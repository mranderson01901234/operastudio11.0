import sharp from "sharp";
import { readFile } from "fs/promises";

export interface AdjustOptions {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
}

export class ImageEditingTools {
  /**
   * Load image from path or base64
   */
  private async loadImage(
    pathOrBase64: string,
    isBase64: boolean
  ): Promise<Buffer> {
    if (isBase64) {
      return Buffer.from(pathOrBase64, "base64");
    } else {
      return await readFile(pathOrBase64);
    }
  }

  /**
   * Crop image to specific region
   */
  async crop(
    imageBuffer: Buffer,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<Buffer> {
    return await sharp(imageBuffer)
      .extract({ left: x, top: y, width, height })
      .toBuffer();
  }

  /**
   * Resize image
   */
  async resize(
    imageBuffer: Buffer,
    width: number,
    height: number,
    maintainAspectRatio: boolean = true
  ): Promise<Buffer> {
    const sharpInstance = sharp(imageBuffer);

    if (maintainAspectRatio) {
      return await sharpInstance.resize(width, height, { fit: "inside" }).toBuffer();
    } else {
      return await sharpInstance.resize(width, height, { fit: "fill" }).toBuffer();
    }
  }

  /**
   * Adjust image properties
   */
  async adjust(
    imageBuffer: Buffer,
    options: AdjustOptions
  ): Promise<Buffer> {
    let instance = sharp(imageBuffer);

    // Brightness, saturation, and hue via modulate
    if (
      options.brightness !== undefined ||
      options.saturation !== undefined ||
      options.hue !== undefined
    ) {
      instance = instance.modulate({
        brightness: options.brightness ?? 1.0,
        saturation: options.saturation ?? 1.0,
        hue: options.hue ?? 0,
      });
    }

    // Contrast via linear
    if (options.contrast !== undefined && options.contrast !== 1.0) {
      const multiplier = options.contrast;
      const offset = -(128 * (multiplier - 1));
      instance = instance.linear(multiplier, offset);
    }

    return await instance.toBuffer();
  }

  /**
   * Apply filter
   */
  async applyFilter(
    imageBuffer: Buffer,
    filter: string,
    intensity: number
  ): Promise<Buffer> {
    let instance = sharp(imageBuffer);

    switch (filter.toLowerCase()) {
      case "blur":
        instance = instance.blur(intensity);
        break;
      case "sharpen":
        instance = instance.sharpen(intensity / 10, 1, 2);
        break;
      case "grayscale":
        instance = instance.greyscale();
        break;
      case "sepia":
        instance = instance.tint({ r: 112, g: 66, b: 20 });
        break;
      case "negate":
        instance = instance.negate();
        break;
      case "threshold":
        instance = instance.threshold(intensity);
        break;
      default:
        throw new Error(`Unknown filter: ${filter}`);
    }

    return await instance.toBuffer();
  }

  /**
   * Rotate or flip image
   */
  async rotate(
    imageBuffer: Buffer,
    angle?: number,
    flip?: string
  ): Promise<Buffer> {
    let instance = sharp(imageBuffer);

    if (flip) {
      if (flip === "horizontal" || flip === "both") {
        instance = instance.flop();
      }
      if (flip === "vertical" || flip === "both") {
        instance = instance.flip();
      }
    } else if (angle !== undefined) {
      instance = instance.rotate(angle);
    }

    return await instance.toBuffer();
  }

  /**
   * Convert format
   */
  async convertFormat(
    imageBuffer: Buffer,
    format: string,
    quality: number = 80
  ): Promise<Buffer> {
    let instance = sharp(imageBuffer);

    switch (format.toLowerCase()) {
      case "png":
        return await instance.png().toBuffer();
      case "jpeg":
      case "jpg":
        return await instance.jpeg({ quality }).toBuffer();
      case "webp":
        return await instance.webp({ quality }).toBuffer();
      case "avif":
        return await instance.avif({ quality }).toBuffer();
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Get MIME type for format
   */
  getMimeTypeForFormat(format: string): string {
    const formatMap: Record<string, string> = {
      png: "image/png",
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      webp: "image/webp",
      avif: "image/avif",
    };
    return formatMap[format.toLowerCase()] || "image/png";
  }

  /**
   * Generate preview thumbnails (256px, 1024px)
   */
  async generatePreviews(imageBuffer: Buffer): Promise<{
    preview256: string;
    preview1024: string;
  }> {
    // Generate 256px thumbnail
    const thumb256 = await sharp(imageBuffer)
      .resize(256, 256, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Generate 1024px preview
    const preview1024 = await sharp(imageBuffer)
      .resize(1024, 1024, { fit: "inside" })
      .jpeg({ quality: 85 })
      .toBuffer();

    return {
      preview256: thumb256.toString("base64"),
      preview1024: preview1024.toString("base64"),
    };
  }

  /**
   * Calculate hash of image buffer
   */
  calculateHash(buffer: Buffer): string {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }
}

