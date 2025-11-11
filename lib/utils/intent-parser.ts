/**
 * Pre-LLM Intent Parser
 * Detects user intent BEFORE sending to LLM for 5-10x faster simple operations
 *
 * Philosophy: Why wait 2 seconds for LLM when we can parse intent in 10ms?
 */

import * as path from "path";
import * as os from "os";
import { filesystemIndex } from "./filesystem-index";
import { resolvePathSmart } from "./working-directory-manager";

export type Intent =
  | { type: "list_directory"; path: string; depth?: number }
  | { type: "read_file"; path: string }
  | { type: "search_files"; pattern: string; location?: string }
  | { type: "get_system_info"; category?: string }
  | { type: "change_directory"; path: string }
  | { type: "find_file"; name: string }
  | { type: "unknown"; reason: string };

export interface IntentParseResult {
  intent: Intent;
  confidence: number;
  directExecution: boolean; // Can we skip LLM?
  estimatedTime: number; // ms
}

/**
 * Normalize path for parsing (expand ~, handle common shortcuts)
 */
function normalizePath(pathStr: string): string {
  let normalized = pathStr.trim();

  // Expand ~
  if (normalized.startsWith("~")) {
    normalized = normalized.replace("~", os.homedir());
  }

  // Handle common shortcuts
  const shortcuts: Record<string, string> = {
    "desktop": path.join(os.homedir(), "Desktop"),
    "documents": path.join(os.homedir(), "Documents"),
    "downloads": path.join(os.homedir(), "Downloads"),
    "home": os.homedir(),
  };

  const lowerPath = normalized.toLowerCase();
  for (const [shortcut, fullPath] of Object.entries(shortcuts)) {
    if (lowerPath === shortcut || lowerPath === `/${shortcut}` || lowerPath === `./${shortcut}`) {
      return fullPath;
    }
  }

  return normalized;
}

/**
 * Parse user message to detect intent patterns
 */
export function parseIntent(message: string, workingDir: string = process.cwd()): IntentParseResult {
  const messageLower = message.toLowerCase().trim();

  // Pattern 1: List directory (ls, list, show files)
  const listPatterns = [
    /^(ls|list|show|display)\s+(?:files\s+(?:in|on|from)\s+)?(.+)$/i,
    /^(ls|list|show|display)\s+(.+)$/i,
    /^show\s+me\s+(?:the\s+)?files\s+(?:in|on|from)\s+(.+)$/i,
    /^what'?s\s+(?:in|on)\s+(?:my\s+)?(.+)$/i,
    /^list\s+(?:the\s+)?(?:files\s+in\s+)?(.+)$/i,
  ];

  for (const pattern of listPatterns) {
    const match = messageLower.match(pattern);
    if (match) {
      const pathStr = match[match.length - 1];
      const normalizedPath = normalizePath(pathStr);

      return {
        intent: { type: "list_directory", path: normalizedPath },
        confidence: 0.95,
        directExecution: true,
        estimatedTime: 50, // 50ms vs 2000ms with LLM
      };
    }
  }

  // Pattern 2: Read file (cat, read, show, open)
  const readPatterns = [
    /^(cat|read|show|open|display)\s+(.+?)(?:\s+file)?$/i,
    /^show\s+me\s+(?:the\s+)?(?:content\s+of\s+)?(.+)$/i,
    /^what'?s\s+in\s+(.+?)(?:\s+file)?$/i,
  ];

  for (const pattern of readPatterns) {
    const match = messageLower.match(pattern);
    if (match) {
      const fileName = match[match.length - 1];

      // Check if this looks like a file (has extension or is in quotes)
      const hasExtension = /\.\w+$/.test(fileName);
      const inQuotes = message.includes(`"${fileName}"`) || message.includes(`'${fileName}'`);

      if (hasExtension || inQuotes) {
        return {
          intent: { type: "read_file", path: fileName },
          confidence: 0.9,
          directExecution: true,
          estimatedTime: 30,
        };
      }
    }
  }

  // Pattern 3: Search/find files
  const searchPatterns = [
    /^find\s+(?:all\s+)?(?:files\s+)?(?:named\s+)?(.+?)(?:\s+in\s+(.+))?$/i,
    /^search\s+for\s+(.+?)(?:\s+in\s+(.+))?$/i,
    /^where\s+is\s+(.+?)(?:\s+file)?$/i,
    /^locate\s+(.+)$/i,
  ];

  for (const pattern of searchPatterns) {
    const match = messageLower.match(pattern);
    if (match) {
      const pattern = match[1];
      const location = match[2] ? normalizePath(match[2]) : undefined;

      return {
        intent: { type: "search_files", pattern, location },
        confidence: 0.85,
        directExecution: true,
        estimatedTime: 100,
      };
    }
  }

  // Pattern 4: System info (no LLM needed!)
  const systemInfoPatterns = [
    /^(?:show|get|display|what'?s)\s+(?:my\s+)?system\s+(?:info|information)$/i,
    /^what\s+(?:is\s+)?(?:my\s+)?(?:os|operating system)$/i,
    /^system\s+info$/i,
    /^uname$/i,
  ];

  for (const pattern of systemInfoPatterns) {
    if (messageLower.match(pattern)) {
      return {
        intent: { type: "get_system_info" },
        confidence: 1.0,
        directExecution: true,
        estimatedTime: 20,
      };
    }
  }

  // Pattern 5: Change directory
  const cdPatterns = [
    /^(?:cd|change\s+(?:directory|dir)|go\s+to|navigate\s+to)\s+(.+)$/i,
    /^cd\s+(.+)$/i,
  ];

  for (const pattern of cdPatterns) {
    const match = messageLower.match(pattern);
    if (match) {
      const pathStr = match[1];
      const normalizedPath = normalizePath(pathStr);

      return {
        intent: { type: "change_directory", path: normalizedPath },
        confidence: 0.95,
        directExecution: true,
        estimatedTime: 30,
      };
    }
  }

  // Unknown intent - send to LLM
  return {
    intent: { type: "unknown", reason: "Pattern not recognized" },
    confidence: 0.0,
    directExecution: false,
    estimatedTime: 2000, // Typical LLM response time
  };
}

/**
 * Execute intent directly without LLM
 */
export async function executeIntent(
  intent: Intent,
  workingDir: string = process.cwd()
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    switch (intent.type) {
      case "list_directory": {
        // Try smart resolution first (project-aware)
        try {
          const smartResolved = await resolvePathSmart(intent.path, true);
          return {
            success: true,
            result: {
              tool: "fs_list",
              path: smartResolved,
              method: "direct_execution_smart",
              time: "~10ms",
            },
          };
        } catch {
          // Smart resolution failed, fall back to index search
        }

        // Use filesystem index for instant results
        const results = filesystemIndex.search(
          path.basename(intent.path),
          "directory",
          1
        );

        if (results.length > 0 && results[0].score >= 0.8) {
          return {
            success: true,
            result: {
              tool: "fs_list",
              path: results[0].path,
              method: "direct_execution",
              time: "~10ms",
            },
          };
        }

        // Fallback: path might be exact
        return {
          success: true,
          result: {
            tool: "fs_list",
            path: intent.path,
            method: "direct_execution",
            time: "~10ms",
          },
        };
      }

      case "read_file": {
        // Try smart resolution first (project-aware)
        try {
          const smartResolved = await resolvePathSmart(intent.path, true);
          return {
            success: true,
            result: {
              tool: "fs_read",
              path: smartResolved,
              method: "direct_execution_smart",
              time: "~5ms",
            },
          };
        } catch {
          // Smart resolution failed, fall back to index search
        }

        // Search for file using index
        const results = filesystemIndex.search(
          intent.path,
          "file",
          5
        );

        if (results.length > 0 && results[0].score >= 0.8) {
          return {
            success: true,
            result: {
              tool: "fs_read",
              path: results[0].path,
              method: "direct_execution",
              confidence: results[0].score,
              time: "~5ms",
            },
          };
        }

        return {
          success: false,
          error: `File not found: ${intent.path}`,
        };
      }

      case "search_files": {
        // Use filesystem index for search
        const results = filesystemIndex.search(
          intent.pattern,
          "both",
          20
        );

        return {
          success: true,
          result: {
            tool: "search",
            pattern: intent.pattern,
            results: results.map(r => ({
              path: r.path,
              score: r.score,
              matchType: r.matchType,
            })),
            count: results.length,
            method: "direct_execution",
            time: "~5ms",
          },
        };
      }

      case "get_system_info": {
        // Direct system info - no file operations needed!
        return {
          success: true,
          result: {
            tool: "system_info",
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            homedir: os.homedir(),
            tmpdir: os.tmpdir(),
            hostname: os.hostname(),
            method: "direct_execution",
            time: "~1ms",
          },
        };
      }

      case "change_directory": {
        // Try smart resolution first (project-aware)
        try {
          const smartResolved = await resolvePathSmart(intent.path, true);
          return {
            success: true,
            result: {
              tool: "change_directory",
              path: smartResolved,
              method: "direct_execution_smart",
              time: "~5ms",
            },
          };
        } catch {
          // Smart resolution failed, fall back to index search
        }

        // Validate directory exists using index
        const results = filesystemIndex.search(
          path.basename(intent.path),
          "directory",
          5
        );

        if (results.length > 0 && results[0].score >= 0.8) {
          return {
            success: true,
            result: {
              tool: "change_directory",
              path: results[0].path,
              method: "direct_execution",
              confidence: results[0].score,
              time: "~5ms",
            },
          };
        }

        return {
          success: false,
          error: `Directory not found: ${intent.path}`,
        };
      }

      default:
        return {
          success: false,
          error: "Intent cannot be executed directly",
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Full pipeline: Parse intent and execute if possible
 */
export async function processMessage(
  message: string,
  workingDir: string = process.cwd()
): Promise<{
  skippedLLM: boolean;
  result?: any;
  error?: string;
  timeSaved?: number; // ms
}> {
  const parseResult = parseIntent(message, workingDir);

  // Only execute directly if high confidence
  if (parseResult.directExecution && parseResult.confidence >= 0.8) {
    const startTime = Date.now();
    const executionResult = await executeIntent(parseResult.intent, workingDir);
    const executionTime = Date.now() - startTime;

    if (executionResult.success) {
      const timeSaved = parseResult.estimatedTime - executionTime;

      console.log(
        `[Intent Parser] ⚡ Direct execution: ${parseResult.intent.type} in ${executionTime}ms (saved ${timeSaved}ms by skipping LLM)`
      );

      return {
        skippedLLM: true,
        result: executionResult.result,
        timeSaved,
      };
    } else {
      console.log(
        `[Intent Parser] ❌ Direct execution failed: ${executionResult.error}, falling back to LLM`
      );

      return {
        skippedLLM: false,
        error: executionResult.error,
      };
    }
  }

  // Low confidence or complex intent - use LLM
  console.log(
    `[Intent Parser] → Sending to LLM (confidence: ${Math.round(parseResult.confidence * 100)}%)`
  );

  return {
    skippedLLM: false,
  };
}
