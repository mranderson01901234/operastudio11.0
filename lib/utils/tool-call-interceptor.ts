/**
 * Tool Call Interceptor
 * Validates and auto-corrects tool call arguments before execution
 *
 * Architecture: Deterministic preprocessing layer around LLM
 * - Catches invalid paths before they cause errors
 * - Auto-corrects typos and ambiguous references
 * - Provides confidence scoring for safety
 *
 * SERVER-ONLY: This module uses Node.js fs/promises and must only run on the server
 */

// Ensure this module only runs on the server
if (typeof window !== "undefined") {
  throw new Error("tool-call-interceptor.ts is a server-only module and cannot be imported in client code");
}

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { filesystemIndex } from "./filesystem-index";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface InterceptorResult {
  /** Whether the tool call was modified */
  modified: boolean;

  /** The potentially corrected tool call */
  toolCall: ToolCall;

  /** Confidence score (0-1) - 1.0 = exact match, <0.8 = risky */
  confidence: number;

  /** Human-readable corrections made */
  corrections: Array<{
    parameter: string;
    originalValue: string;
    correctedValue: string;
    reason: string;
  }>;

  /** Warnings for potentially destructive operations */
  warnings: string[];
}

/**
 * Normalize a path (expand ~, resolve relative paths)
 */
function normalizePath(filePath: string, workingDir: string = process.cwd()): string {
  let normalized = filePath.trim();

  // Expand ~ to home directory
  if (normalized.startsWith("~")) {
    normalized = normalized.replace("~", os.homedir());
  }

  // If relative path, resolve against working directory
  if (!path.isAbsolute(normalized)) {
    normalized = path.resolve(workingDir, normalized);
  }

  return normalized;
}

/**
 * Check if a path exists
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and correct a file/directory path using filesystem index
 */
async function validatePath(
  pathValue: string,
  type: "file" | "directory" | "both" = "both",
  workingDir: string = process.cwd()
): Promise<{
  valid: boolean;
  correctedPath?: string;
  confidence: number;
  reason?: string;
}> {
  // First, try to normalize and check if it exists as-is
  const normalizedPath = normalizePath(pathValue, workingDir);

  if (await pathExists(normalizedPath)) {
    return {
      valid: true,
      correctedPath: normalizedPath,
      confidence: 1.0,
      reason: "Path exists"
    };
  }

  // Path doesn't exist - try to find it using filesystem index
  const basename = path.basename(pathValue);
  const indexResults = filesystemIndex.search(basename, type, 5);

  if (indexResults.length === 0) {
    return {
      valid: false,
      confidence: 0.0,
      reason: `Path not found: ${pathValue}`
    };
  }

  // Get the best match
  const bestMatch = indexResults[0];

  // Auto-correct if confidence is high enough (exact match or very similar)
  if (bestMatch.score >= 0.8) {
    return {
      valid: false,
      correctedPath: bestMatch.path,
      confidence: bestMatch.score,
      reason: bestMatch.matchType === "exact"
        ? `Found exact match: ${basename} → ${bestMatch.path}`
        : `Found similar match (${Math.round(bestMatch.score * 100)}% similar): ${basename} → ${bestMatch.path}`
    };
  }

  // Low confidence - don't auto-correct
  return {
    valid: false,
    confidence: bestMatch.score,
    reason: `Path not found. Closest match: ${bestMatch.path} (${Math.round(bestMatch.score * 100)}% similar) - too low to auto-correct`
  };
}

/**
 * Assess risk level for a tool call
 */
function assessRisk(toolCall: ToolCall, pathArg: string | undefined): {
  level: "safe" | "moderate" | "destructive";
  warnings: string[];
} {
  const warnings: string[] = [];

  // Destructive operations
  if (toolCall.name === "fs_delete") {
    const recursive = toolCall.arguments.recursive === true;
    if (recursive) {
      warnings.push("⚠️ DESTRUCTIVE: Recursive delete - will remove directory and all contents");
    } else {
      warnings.push("⚠️ DESTRUCTIVE: File/directory will be permanently deleted");
    }
    return { level: "destructive", warnings };
  }

  // Moderate risk - overwriting existing files
  if (toolCall.name === "fs_write") {
    if (pathArg) {
      warnings.push("⚠️ MODERATE RISK: Will overwrite file if it exists");
    }
    return { level: "moderate", warnings };
  }

  // Safe operations (read-only)
  return { level: "safe", warnings: [] };
}

/**
 * Intercept and validate a tool call before execution
 *
 * @param toolCall - The original tool call from LLM
 * @param workingDir - Current working directory for path resolution
 * @returns Interceptor result with potentially corrected tool call
 */
export async function interceptToolCall(
  toolCall: ToolCall,
  workingDir: string = process.cwd()
): Promise<InterceptorResult> {
  const result: InterceptorResult = {
    modified: false,
    toolCall: { ...toolCall },
    confidence: 1.0,
    corrections: [],
    warnings: [],
  };

  // Only intercept file system tools and change_directory
  const fileSystemTools = ["fs_read", "fs_write", "fs_list", "fs_delete", "change_directory"];
  if (!fileSystemTools.includes(toolCall.name)) {
    return result; // Pass through non-filesystem tools unchanged
  }

  // Extract path argument
  const pathArg = toolCall.arguments.path as string | undefined;
  if (!pathArg) {
    return result; // No path to validate
  }

  // Assess risk before validation
  const risk = assessRisk(toolCall, pathArg);
  result.warnings = risk.warnings;

  // Determine expected path type based on tool
  let pathType: "file" | "directory" | "both" = "both";
  if (toolCall.name === "fs_list" || toolCall.name === "change_directory") {
    pathType = "directory";
  } else if (toolCall.name === "fs_read") {
    pathType = "file";
  }

  // Validate and potentially correct the path
  const validation = await validatePath(pathArg, pathType, workingDir);

  if (validation.valid && validation.correctedPath) {
    // Path exists but may need normalization (e.g., ~ expansion)
    if (validation.correctedPath !== pathArg) {
      result.modified = true;
      result.toolCall.arguments = {
        ...toolCall.arguments,
        path: validation.correctedPath,
      };
      result.corrections.push({
        parameter: "path",
        originalValue: pathArg,
        correctedValue: validation.correctedPath,
        reason: "Normalized path (expanded ~ or resolved relative path)",
      });
    }
    result.confidence = validation.confidence;
  } else if (!validation.valid && validation.correctedPath && validation.confidence >= 0.8) {
    // Path doesn't exist but we found a high-confidence match - auto-correct
    result.modified = true;
    result.toolCall.arguments = {
      ...toolCall.arguments,
      path: validation.correctedPath,
    };
    result.corrections.push({
      parameter: "path",
      originalValue: pathArg,
      correctedValue: validation.correctedPath,
      reason: validation.reason || "Auto-corrected using filesystem index",
    });
    result.confidence = validation.confidence;

    // Add warning for destructive operations with auto-correction
    if (risk.level === "destructive") {
      result.warnings.push(
        `🔄 Auto-corrected path: "${pathArg}" → "${validation.correctedPath}" (${Math.round(validation.confidence * 100)}% confidence)`
      );
    }
  } else {
    // Path not found and no good correction available
    result.confidence = validation.confidence;
    if (validation.reason) {
      result.warnings.push(`❌ ${validation.reason}`);
    }
  }

  return result;
}

/**
 * Log corrections for learning and debugging
 */
export function logCorrection(
  toolCall: ToolCall,
  result: InterceptorResult,
  success: boolean,
  error?: string
): void {
  if (!result.modified) return;

  const logEntry = {
    timestamp: new Date().toISOString(),
    tool: toolCall.name,
    corrections: result.corrections,
    confidence: result.confidence,
    success,
    error,
  };

  // Log to console in development
  if (process.env.NODE_ENV === "development") {
    if (success) {
      console.log(`[Tool Interceptor] ✅ Successful auto-correction:`, logEntry);
    } else {
      console.warn(`[Tool Interceptor] ❌ Failed auto-correction:`, logEntry);
    }
  }

  // TODO: Store corrections in database for learning
  // This data can be used to:
  // 1. Track LLM mistake patterns
  // 2. Improve system prompts
  // 3. Build a correction cache
  // 4. Generate reports on success rates
}
