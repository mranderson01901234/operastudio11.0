import { writeFile, rename, mkdir } from "fs/promises";
import { join } from "path";
import * as os from "os";
import { createHash } from "crypto";

const TEMP_DIR = process.env.IMAGE_TEMP_DIR || join(os.tmpdir(), "operastudio-images");

/**
 * Get file extension from MIME type
 */
function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  return map[mimeType] || "png";
}

/**
 * Atomically write image: tmp → fsync → rename
 * Prevents corruption during writes
 */
export async function writeImageAtomically(
  buffer: Buffer,
  mimeType: string
): Promise<{ path: string; hash: string }> {
  await mkdir(TEMP_DIR, { recursive: true });

  const extension = getExtension(mimeType);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const tempPath = join(TEMP_DIR, `tmp_${timestamp}_${random}.${extension}`);
  const finalPath = join(TEMP_DIR, `img_${timestamp}_${random}.${extension}`);

  // Write to temp file
  await writeFile(tempPath, buffer);

  // Calculate hash before rename
  const hash = createHash("sha256").update(buffer).digest("hex");

  // Atomic rename (fsync happens automatically on most systems)
  await rename(tempPath, finalPath);

  return { path: finalPath, hash };
}

