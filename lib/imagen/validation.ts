export interface ValidationLimits {
  maxWidth: number;
  maxHeight: number;
  maxMegapixels: number;
  maxFileSize: number; // bytes
  allowedFormats: string[];
}

export const DEFAULT_LIMITS: ValidationLimits = {
  maxWidth: 8192,
  maxHeight: 8192,
  maxMegapixels: 64, // 8K x 8K
  maxFileSize: 50 * 1024 * 1024, // 50 MB
  allowedFormats: ["png", "jpeg", "jpg", "webp", "avif"],
};

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

/**
 * Validate image dimensions
 */
export function validateImageDimensions(
  width: number,
  height: number,
  limits: ValidationLimits = DEFAULT_LIMITS
): ValidationResult {
  if (width <= 0 || height <= 0) {
    return {
      valid: false,
      error: "Width and height must be positive",
      code: "INVALID_ARGS",
    };
  }

  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return {
      valid: false,
      error: "Width and height must be integers",
      code: "INVALID_ARGS",
    };
  }

  if (width > limits.maxWidth) {
    return {
      valid: false,
      error: `Width ${width} exceeds maximum ${limits.maxWidth}`,
      code: "IMAGE_TOO_LARGE",
    };
  }

  if (height > limits.maxHeight) {
    return {
      valid: false,
      error: `Height ${height} exceeds maximum ${limits.maxHeight}`,
      code: "IMAGE_TOO_LARGE",
    };
  }

  const megapixels = (width * height) / 1_000_000;
  if (megapixels > limits.maxMegapixels) {
    return {
      valid: false,
      error: `${megapixels.toFixed(1)}MP exceeds maximum ${limits.maxMegapixels}MP`,
      code: "IMAGE_TOO_LARGE",
    };
  }

  return { valid: true };
}

/**
 * Validate image format
 */
export function validateFormat(
  format: string,
  limits: ValidationLimits = DEFAULT_LIMITS
): ValidationResult {
  const normalizedFormat = format.toLowerCase();
  if (!limits.allowedFormats.includes(normalizedFormat)) {
    return {
      valid: false,
      error: `Format ${format} not allowed. Allowed: ${limits.allowedFormats.join(", ")}`,
      code: "UNSUPPORTED_FORMAT",
    };
  }

  return { valid: true };
}

/**
 * Validate crop parameters
 */
export function validateCropParams(
  x: number,
  y: number,
  width: number,
  height: number
): ValidationResult {
  if (x < 0 || y < 0) {
    return {
      valid: false,
      error: "Crop coordinates must be non-negative",
      code: "INVALID_ARGS",
    };
  }

  if (width <= 0 || height <= 0) {
    return {
      valid: false,
      error: "Crop dimensions must be positive",
      code: "INVALID_ARGS",
    };
  }

  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return {
      valid: false,
      error: "Crop coordinates must be integers",
      code: "INVALID_ARGS",
    };
  }

  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return {
      valid: false,
      error: "Crop dimensions must be integers",
      code: "INVALID_ARGS",
    };
  }

  return { valid: true };
}

/**
 * Validate adjustment values
 */
export function validateAdjustment(
  brightness?: number,
  contrast?: number,
  saturation?: number,
  hue?: number
): ValidationResult {
  if (brightness !== undefined) {
    if (typeof brightness !== "number" || brightness < 0.1 || brightness > 3.0) {
      return {
        valid: false,
        error: "Brightness must be between 0.1 and 3.0",
        code: "INVALID_ARGS",
      };
    }
  }

  if (contrast !== undefined) {
    if (typeof contrast !== "number" || contrast < 0.1 || contrast > 3.0) {
      return {
        valid: false,
        error: "Contrast must be between 0.1 and 3.0",
        code: "INVALID_ARGS",
      };
    }
  }

  if (saturation !== undefined) {
    if (typeof saturation !== "number" || saturation < 0 || saturation > 3.0) {
      return {
        valid: false,
        error: "Saturation must be between 0 and 3.0",
        code: "INVALID_ARGS",
      };
    }
  }

  if (hue !== undefined) {
    if (typeof hue !== "number" || hue < 0 || hue > 360) {
      return {
        valid: false,
        error: "Hue must be between 0 and 360 degrees",
        code: "INVALID_ARGS",
      };
    }
  }

  return { valid: true };
}

/**
 * Validate filter parameters
 */
export function validateFilter(
  filter: string,
  intensity?: number
): ValidationResult {
  const allowedFilters = [
    "blur",
    "sharpen",
    "grayscale",
    "sepia",
    "negate",
    "threshold",
  ];

  if (!allowedFilters.includes(filter.toLowerCase())) {
    return {
      valid: false,
      error: `Filter ${filter} not allowed. Allowed: ${allowedFilters.join(", ")}`,
      code: "INVALID_ARGS",
    };
  }

  if (intensity !== undefined) {
    if (typeof intensity !== "number" || intensity < 0 || intensity > 100) {
      return {
        valid: false,
        error: "Filter intensity must be between 0 and 100",
        code: "INVALID_ARGS",
      };
    }
  }

  return { valid: true };
}

/**
 * Validate rotation parameters
 */
export function validateRotation(
  angle?: number,
  flip?: string
): ValidationResult {
  if (angle !== undefined && flip !== undefined) {
    return {
      valid: false,
      error: "Cannot specify both angle and flip",
      code: "INVALID_ARGS",
    };
  }

  if (angle !== undefined) {
    if (typeof angle !== "number" || !Number.isInteger(angle)) {
      return {
        valid: false,
        error: "Rotation angle must be an integer",
        code: "INVALID_ARGS",
      };
    }
    const validAngles = [90, 180, 270, -90, -180, -270];
    if (!validAngles.includes(angle)) {
      return {
        valid: false,
        error: `Rotation angle must be one of: ${validAngles.join(", ")}`,
        code: "INVALID_ARGS",
      };
    }
  }

  if (flip !== undefined) {
    const validFlips = ["horizontal", "vertical", "both"];
    if (!validFlips.includes(flip)) {
      return {
        valid: false,
        error: `Flip must be one of: ${validFlips.join(", ")}`,
        code: "INVALID_ARGS",
      };
    }
  }

  if (angle === undefined && flip === undefined) {
    return {
      valid: false,
      error: "Must specify either angle or flip",
      code: "INVALID_ARGS",
    };
  }

  return { valid: true };
}

/**
 * Sanitize file path (prevent directory traversal)
 */
export function sanitizePath(path: string): ValidationResult {
  // Prevent directory traversal
  if (path.includes("..") || path.includes("/") || path.includes("\\")) {
    return {
      valid: false,
      error: "Path contains illegal characters",
      code: "INVALID_PATH",
    };
  }

  // Allowlist workspace directories
  const allowedDirs = [
    process.env.IMAGE_TEMP_DIR || "/tmp/operastudio-images",
  ];

  try {
    const { resolve } = require("path");
    const resolved = resolve(path);
    const isAllowed = allowedDirs.some((dir) => resolved.startsWith(dir));

    if (!isAllowed) {
      return {
        valid: false,
        error: "Path outside allowed directories",
        code: "INVALID_PATH",
      };
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: "Invalid path format",
      code: "INVALID_PATH",
    };
  }
}

