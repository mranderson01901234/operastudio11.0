/**
 * Batch Operation Validator
 * Validate and preview batch operations before execution
 *
 * Philosophy: Prevent accidental mass deletions and operations
 * - Show what will be affected before execution
 * - Require confirmation for destructive batch operations
 * - Progress tracking for batch operations
 *
 * NOTE: This module uses Node.js fs/promises and should only be imported server-side.
 * For client components, import types and utilities from batch-validator-types.ts
 */

import * as fs from "fs/promises";
import * as path from "path";

// Re-export types and client-safe utilities
export type {
  BatchTarget,
  BatchValidationResult,
  BatchExecutionProgress,
} from "./batch-validator-types";
export { formatBytes } from "./batch-validator-types";

// Import types and utilities for internal use
import type {
  BatchTarget,
  BatchValidationResult,
  BatchExecutionProgress,
} from "./batch-validator-types";
import { formatBytes } from "./batch-validator-types";

/**
 * Validate batch operation and return preview
 */
export async function validateBatchOperation(
  operation: "delete" | "move" | "copy" | "modify",
  pattern: string | RegExp,
  basePath: string,
  options?: {
    recursive?: boolean;
    maxDepth?: number;
    fileTypes?: string[]; // e.g., [".log", ".tmp"]
    excludePatterns?: string[]; // e.g., ["node_modules", ".git"]
  }
): Promise<BatchValidationResult> {

  const result: BatchValidationResult = {
    operation,
    targets: [],
    totalSize: 0,
    isDestructive: operation === "delete",
    requiresConfirmation: false,
    warnings: [],
    estimatedTime: 0,
    safetyLevel: "safe",
  };

  try {
    // Find matching files/directories
    const targets = await findMatchingTargets(pattern, basePath, options);

    result.targets = targets;
    result.totalSize = targets.reduce((sum, t) => sum + (t.size || 0), 0);

    // Assess safety level
    if (operation === "delete") {
      result.safetyLevel = assessDeleteSafety(targets, result.totalSize);
    } else {
      result.safetyLevel = "moderate";
    }

    // Generate warnings
    result.warnings = generateWarnings(operation, targets, result.totalSize, options);

    // Determine if confirmation is required
    result.requiresConfirmation =
      result.isDestructive ||
      targets.length > 10 ||
      result.totalSize > 100 * 1024 * 1024 || // > 100MB
      result.safetyLevel === "dangerous";

    // Estimate execution time (rough estimate)
    result.estimatedTime = Math.max(100, targets.length * 50); // ~50ms per file

    console.log(
      `[Batch Validator] Found ${targets.length} targets for ${operation} (${formatBytes(result.totalSize)}) - Safety: ${result.safetyLevel}`
    );
  } catch (error) {
    result.warnings.push(
      `Error during validation: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  return result;
}

/**
 * Find files/directories matching pattern
 */
async function findMatchingTargets(
  pattern: string | RegExp,
  basePath: string,
  options?: {
    recursive?: boolean;
    maxDepth?: number;
    fileTypes?: string[];
    excludePatterns?: string[];
  }
): Promise<BatchTarget[]> {
  const targets: BatchTarget[] = [];
  const maxDepth = options?.maxDepth || (options?.recursive ? 10 : 1);

  async function scanDirectory(dirPath: string, currentDepth: number): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Check exclude patterns
        if (options?.excludePatterns) {
          const shouldExclude = options.excludePatterns.some((exclude) =>
            fullPath.includes(exclude)
          );
          if (shouldExclude) continue;
        }

        // Check if matches pattern
        let matches = false;
        if (typeof pattern === "string") {
          matches = entry.name.includes(pattern) || fullPath.includes(pattern);
        } else {
          matches = pattern.test(entry.name) || pattern.test(fullPath);
        }

        // Check file type filter
        if (options?.fileTypes && !entry.isDirectory()) {
          const ext = path.extname(entry.name);
          if (!options.fileTypes.includes(ext)) {
            matches = false;
          }
        }

        if (matches) {
          try {
            const stats = await fs.stat(fullPath);

            targets.push({
              path: fullPath,
              type: entry.isDirectory() ? "directory" : "file",
              size: stats.size,
              matchReason: typeof pattern === "string" ? `Contains "${pattern}"` : "Regex match",
            });
          } catch {
            // Can't stat file, skip
          }
        }

        // Recurse into directories
        if (entry.isDirectory() && currentDepth < maxDepth) {
          await scanDirectory(fullPath, currentDepth + 1);
        }
      }
    } catch (error) {
      // Can't read directory, skip
    }
  }

  await scanDirectory(basePath, 0);

  return targets;
}

/**
 * Assess safety level for delete operations
 */
function assessDeleteSafety(targets: BatchTarget[], totalSize: number): "safe" | "moderate" | "dangerous" {
  const fileCount = targets.length;
  const hasDirectories = targets.some((t) => t.type === "directory");

  // Dangerous: Many files, large size, or directories
  if (fileCount > 100 || totalSize > 1024 * 1024 * 1024 || hasDirectories) {
    return "dangerous";
  }

  // Moderate: Some files
  if (fileCount > 10 || totalSize > 10 * 1024 * 1024) {
    return "moderate";
  }

  // Safe: Few small files
  return "safe";
}

/**
 * Generate warnings for batch operation
 */
function generateWarnings(
  operation: string,
  targets: BatchTarget[],
  totalSize: number,
  options?: any
): string[] {
  const warnings: string[] = [];

  if (targets.length === 0) {
    warnings.push("⚠️ No targets found matching the criteria");
    return warnings;
  }

  if (operation === "delete") {
    warnings.push(
      `🗑️  DESTRUCTIVE: Will permanently delete ${targets.length} item${targets.length === 1 ? "" : "s"} (${formatBytes(totalSize)})`
    );

    const dirCount = targets.filter((t) => t.type === "directory").length;
    if (dirCount > 0) {
      warnings.push(
        `📁 Will delete ${dirCount} director${dirCount === 1 ? "y" : "ies"} and all their contents`
      );
    }

    if (totalSize > 100 * 1024 * 1024) {
      warnings.push(`💾 Large deletion: ${formatBytes(totalSize)} of data will be removed`);
    }
  }

  if (targets.length > 50) {
    warnings.push(`📊 Large batch: ${targets.length} items will be affected`);
  }

  // Check for potentially important files
  const importantPatterns = [
    ".git",
    "node_modules",
    "package.json",
    "package-lock.json",
    ".env",
    "config",
  ];

  const importantFiles = targets.filter((t) =>
    importantPatterns.some((pattern) => t.path.includes(pattern))
  );

  if (importantFiles.length > 0) {
    warnings.push(
      `⚡ Contains potentially important files/directories (${importantFiles.length} items)`
    );
  }

  return warnings;
}

/**
 * Execute batch operation with progress tracking
 */
export async function executeBatchOperation(
  validation: BatchValidationResult,
  executeCallback: (target: BatchTarget) => Promise<{ success: boolean; error?: string }>,
  progressCallback?: (progress: BatchExecutionProgress) => void
): Promise<BatchExecutionProgress> {
  const progress: BatchExecutionProgress = {
    total: validation.targets.length,
    completed: 0,
    failed: 0,
    errors: [],
  };

  for (const target of validation.targets) {
    progress.currentItem = target.path;

    if (progressCallback) {
      progressCallback({ ...progress });
    }

    try {
      const result = await executeCallback(target);

      if (result.success) {
        progress.completed++;
      } else {
        progress.failed++;
        progress.errors.push({
          path: target.path,
          error: result.error || "Unknown error",
        });
      }
    } catch (error) {
      progress.failed++;
      progress.errors.push({
        path: target.path,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  progress.currentItem = undefined;

  console.log(
    `[Batch Executor] Completed: ${progress.completed}/${progress.total}, Failed: ${progress.failed}`
  );

  if (progressCallback) {
    progressCallback({ ...progress });
  }

  return progress;
}


/**
 * Preview batch operation (user-friendly format)
 */
export function formatBatchPreview(validation: BatchValidationResult, maxItems: number = 10): string {
  const parts: string[] = [];

  parts.push(`## Batch ${validation.operation.toUpperCase()} Preview\n`);

  parts.push(`**Targets:** ${validation.targets.length} item${validation.targets.length === 1 ? "" : "s"}`);
  parts.push(`**Total Size:** ${formatBytes(validation.totalSize)}`);
  parts.push(`**Safety Level:** ${validation.safetyLevel.toUpperCase()}`);
  parts.push(`**Estimated Time:** ${validation.estimatedTime}ms\n`);

  if (validation.warnings.length > 0) {
    parts.push(`### ⚠️ Warnings:`);
    validation.warnings.forEach((w) => parts.push(`- ${w}`));
    parts.push("");
  }

  if (validation.targets.length > 0) {
    parts.push(`### Items to be affected (showing ${Math.min(maxItems, validation.targets.length)} of ${validation.targets.length}):\n`);

    const itemsToShow = validation.targets.slice(0, maxItems);

    for (const target of itemsToShow) {
      const icon = target.type === "directory" ? "📁" : "📄";
      const size = target.size ? ` (${formatBytes(target.size)})` : "";
      parts.push(`${icon} \`${target.path}\`${size}`);
    }

    if (validation.targets.length > maxItems) {
      parts.push(`\n... and ${validation.targets.length - maxItems} more items`);
    }
  }

  if (validation.requiresConfirmation) {
    parts.push(`\n⚠️ **Confirmation Required** - This operation cannot be undone automatically.`);
  }

  return parts.join("\n");
}
