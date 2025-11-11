/**
 * Client-safe types and utilities for batch operations
 * These can be safely imported in client components
 */

export interface BatchTarget {
  path: string;
  type: "file" | "directory";
  size?: number;
  matchReason: string;
}

export interface BatchValidationResult {
  operation: string;
  targets: BatchTarget[];
  totalSize: number;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  warnings: string[];
  estimatedTime: number; // ms
  safetyLevel: "safe" | "moderate" | "dangerous";
}

export interface BatchExecutionProgress {
  total: number;
  completed: number;
  failed: number;
  currentItem?: string;
  errors: Array<{ path: string; error: string }>;
}

/**
 * Format bytes to human-readable string
 * Client-safe utility function
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

