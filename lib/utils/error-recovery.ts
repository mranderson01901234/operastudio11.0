/**
 * Error Recovery System
 * Automatically retry failed operations with intelligent corrections
 *
 * Philosophy: 30% of failures can be automatically recovered
 * - File not found → Search and retry with similar paths
 * - Permission denied → Retry with sudo
 * - Directory not empty → Offer recursive option
 * 
 * NOTE: This module uses Node.js fs and should only be used server-side
 */

// Server-only imports
let fs: typeof import("fs/promises") | null = null;
let path: typeof import("path") | null = null;

if (typeof window === "undefined") {
  fs = require("fs/promises");
  path = require("path");
}

import type { ToolCall, ToolResult } from "@/lib/chat/tool-handler";

// Conditionally import filesystem-index (server-only)
let filesystemIndex: { search: (name: string, type: "file" | "directory" | "both", limit: number) => Array<{ path: string; score: number }> } | null = null;

try {
  // Only import on server-side
  if (typeof window === "undefined") {
    const indexModule = require("./filesystem-index");
    filesystemIndex = indexModule.filesystemIndex;
  }
} catch (error) {
  // filesystem-index not available (client-side or import failed)
  console.warn("[Error Recovery] filesystem-index not available, path correction disabled");
}

export interface RecoveryStrategy {
  name: string;
  description: string;
  confidence: number;
  correctedToolCall: ToolCall;
}

export interface RecoveryResult {
  recoverable: boolean;
  strategies: RecoveryStrategy[];
  autoRetry: boolean; // Should we auto-retry or ask user?
  maxRetries: number;
}

/**
 * Analyze error and generate recovery strategies
 */
export function analyzeError(
  toolCall: ToolCall,
  error: string,
  errorCode?: string
): RecoveryResult {
  const result: RecoveryResult = {
    recoverable: false,
    strategies: [],
    autoRetry: false,
    maxRetries: 3,
  };

  // Strategy 1: File/Directory Not Found
  if (
    error.includes("not found") ||
    error.includes("ENOENT") ||
    error.includes("no such file") ||
    errorCode === "ENOENT"
  ) {
    const pathArg = toolCall.arguments.path as string | undefined;

    if (pathArg) {
      // Search for similar paths using filesystem index (server-side only)
      if (!path || !filesystemIndex) {
        // Client-side: skip path correction
        return result;
      }
      
      const basename = path.basename(pathArg);
      const searchResults = filesystemIndex.search(basename, "both", 5);

      for (const match of searchResults) {
        if (match.score >= 0.6) {
          result.strategies.push({
            name: "path_correction",
            description: `Try similar path: ${match.path}`,
            confidence: match.score,
            correctedToolCall: {
              ...toolCall,
              arguments: {
                ...toolCall.arguments,
                path: match.path,
              },
            },
          });
        }
      }

      // Auto-retry if we have high confidence match
      if (result.strategies.length > 0 && result.strategies[0].confidence >= 0.9) {
        result.autoRetry = true;
      }

      result.recoverable = result.strategies.length > 0;
    }
  }

  // Strategy 2: Permission Denied
  if (
    error.includes("permission denied") ||
    error.includes("EACCES") ||
    error.includes("EPERM") ||
    errorCode === "EACCES" ||
    errorCode === "EPERM"
  ) {
    if (toolCall.name === "cmd_execute" && !toolCall.arguments.useSudo) {
      result.strategies.push({
        name: "use_sudo",
        description: "Retry with sudo privileges",
        confidence: 0.95,
        correctedToolCall: {
          ...toolCall,
          arguments: {
            ...toolCall.arguments,
            useSudo: true,
          },
        },
      });

      result.autoRetry = true; // Safe to auto-retry with sudo
      result.recoverable = true;
    }
  }

  // Strategy 3: Directory Not Empty (for delete operations)
  if (
    error.includes("directory not empty") ||
    error.includes("ENOTEMPTY") ||
    errorCode === "ENOTEMPTY"
  ) {
    if (toolCall.name === "fs_delete" && !toolCall.arguments.recursive) {
      result.strategies.push({
        name: "recursive_delete",
        description: "Delete directory recursively (including all contents)",
        confidence: 0.8,
        correctedToolCall: {
          ...toolCall,
          arguments: {
            ...toolCall.arguments,
            recursive: true,
          },
        },
      });

      // DON'T auto-retry destructive operations - ask user
      result.autoRetry = false;
      result.recoverable = true;
    }
  }

  // Strategy 4: File Already Exists (for write operations)
  if (
    error.includes("already exists") ||
    error.includes("EEXIST") ||
    errorCode === "EEXIST"
  ) {
    if (toolCall.name === "fs_write") {
      // Offer to overwrite
      result.strategies.push({
        name: "overwrite",
        description: "Overwrite existing file",
        confidence: 0.9,
        correctedToolCall: {
          ...toolCall,
          arguments: {
            ...toolCall.arguments,
            create: true, // Force overwrite
          },
        },
      });

      // Safe to auto-retry for writes (user intended to write)
      result.autoRetry = true;
      result.recoverable = true;
    }
  }

  // Strategy 5: Timeout Errors
  if (error.includes("timeout") || error.includes("timed out")) {
    // Increase timeout and retry
    const currentTimeout = (toolCall.arguments.timeout as number) || 30000;
    const newTimeout = Math.min(currentTimeout * 2, 300000); // Max 5 minutes

    result.strategies.push({
      name: "increase_timeout",
      description: `Increase timeout to ${newTimeout / 1000} seconds`,
      confidence: 0.85,
      correctedToolCall: {
        ...toolCall,
        arguments: {
          ...toolCall.arguments,
          timeout: newTimeout,
        },
      },
    });

    result.autoRetry = true;
    result.recoverable = true;
  }

  // Strategy 6: Invalid Path Format
  if (error.includes("invalid path") || error.includes("illegal character")) {
    const pathArg = toolCall.arguments.path as string | undefined;

    if (pathArg) {
      // Try to sanitize path
      const sanitized = pathArg
        .replace(/[<>:"|?*]/g, "_") // Replace invalid chars
        .replace(/\s+/g, "-") // Replace spaces with dashes
        .trim();

      if (sanitized !== pathArg) {
        result.strategies.push({
          name: "sanitize_path",
          description: `Use sanitized path: ${sanitized}`,
          confidence: 0.7,
          correctedToolCall: {
            ...toolCall,
            arguments: {
              ...toolCall.arguments,
              path: sanitized,
            },
          },
        });

        result.autoRetry = true;
        result.recoverable = true;
      }
    }
  }

  return result;
}

/**
 * Execute recovery strategy
 */
export async function executeRecovery(
  strategy: RecoveryStrategy,
  executeToolCall: (toolCall: ToolCall) => Promise<ToolResult>,
  retryCount: number = 0,
  maxRetries: number = 3
): Promise<ToolResult> {
  if (retryCount >= maxRetries) {
    return {
      callId: strategy.correctedToolCall.id,
      name: strategy.correctedToolCall.name,
      result: null,
      error: `Max retries (${maxRetries}) reached for recovery strategy: ${strategy.name}`,
    };
  }

  console.log(
    `[Error Recovery] 🔄 Attempting recovery (${retryCount + 1}/${maxRetries}): ${strategy.name} - ${strategy.description}`
  );

  try {
    const result = await executeToolCall(strategy.correctedToolCall);

    if (result.error) {
      // Recovery failed, analyze new error and try next strategy
      console.warn(
        `[Error Recovery] ❌ Recovery attempt failed: ${result.error}`
      );

      const newRecovery = analyzeError(
        strategy.correctedToolCall,
        result.error,
        result.errorCode
      );

      if (newRecovery.recoverable && newRecovery.strategies.length > 0) {
        // Try next strategy
        return executeRecovery(
          newRecovery.strategies[0],
          executeToolCall,
          retryCount + 1,
          maxRetries
        );
      }

      return result; // No more strategies, return error
    }

    console.log(
      `[Error Recovery] ✅ Recovery successful using: ${strategy.name}`
    );

    return result;
  } catch (error) {
    return {
      callId: strategy.correctedToolCall.id,
      name: strategy.correctedToolCall.name,
      result: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Automatic error recovery pipeline
 */
export async function recoverFromError(
  toolCall: ToolCall,
  error: string,
  errorCode: string | undefined,
  executeToolCall: (toolCall: ToolCall) => Promise<ToolResult>,
  autoRetryOnly: boolean = true // Only auto-retry safe operations
): Promise<{
  recovered: boolean;
  result?: ToolResult;
  strategies?: RecoveryStrategy[];
  message?: string;
}> {
  const recovery = analyzeError(toolCall, error, errorCode);

  if (!recovery.recoverable) {
    return {
      recovered: false,
      message: "No recovery strategies available",
    };
  }

  // If autoRetryOnly is true, only execute if autoRetry is true
  if (autoRetryOnly && !recovery.autoRetry) {
    return {
      recovered: false,
      strategies: recovery.strategies,
      message: "Recovery available but requires user confirmation (destructive operation)",
    };
  }

  // Execute first strategy
  const firstStrategy = recovery.strategies[0];
  const result = await executeRecovery(
    firstStrategy,
    executeToolCall,
    0,
    recovery.maxRetries
  );

  if (!result.error) {
    return {
      recovered: true,
      result,
      message: `Recovered using: ${firstStrategy.name}`,
    };
  }

  return {
    recovered: false,
    result,
    strategies: recovery.strategies,
    message: `Recovery failed: ${result.error}`,
  };
}

/**
 * Get user-friendly error message with recovery suggestions
 */
export function formatErrorWithRecovery(
  error: string,
  recovery: RecoveryResult
): string {
  let message = `❌ ${error}\n`;

  if (recovery.recoverable && recovery.strategies.length > 0) {
    message += `\n🔧 Recovery Options:\n`;

    recovery.strategies.forEach((strategy, index) => {
      const confidence = Math.round(strategy.confidence * 100);
      message += `${index + 1}. ${strategy.description} (${confidence}% confidence)\n`;
    });

    if (recovery.autoRetry) {
      message += `\n⚡ Auto-retrying with highest confidence option...`;
    }
  } else {
    message += `\n⚠️ No automatic recovery available. Please check the path and try again.`;
  }

  return message;
}
