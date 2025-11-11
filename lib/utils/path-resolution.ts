/**
 * Server-side path resolution utilities
 * Provides fuzzy path matching and automatic file/directory discovery
 * Now with blazing-fast filesystem index cache
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { filesystemIndex } from "./filesystem-index";
import { resolvePathSmart } from "./working-directory-manager";

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Normalize path (expand ~, resolve relative paths)
 */
function normalizePath(filePath: string, workingDir: string = "~"): string {
  let normalized = filePath.trim();
  
  // Expand ~ to home directory
  if (normalized.startsWith("~")) {
    normalized = normalized.replace("~", os.homedir());
  }
  
  // If relative path, resolve against working directory
  if (!normalized.startsWith("/")) {
    const baseDir = workingDir === "~" ? os.homedir() : (workingDir.startsWith("~") ? workingDir.replace("~", os.homedir()) : workingDir);
    // Ensure baseDir is absolute
    const absoluteBaseDir = path.isAbsolute(baseDir) ? baseDir : path.resolve(os.homedir(), baseDir);
    normalized = path.resolve(absoluteBaseDir, normalized);
  } else {
    // Already absolute, just resolve to clean up any .. or .
    normalized = path.resolve(normalized);
  }
  
  return normalized;
}

/**
 * Search for files/directories using cached index (FAST: <5ms)
 * Falls back to slow search if index not ready
 */
async function searchInCommonLocations(
  name: string,
  type: "file" | "directory" | "both" = "both",
  maxDepth: number = 3
): Promise<string[]> {
  // Use cached index for instant results (with error handling)
  try {
    const indexResults = filesystemIndex.search(name, type, 10);

    if (indexResults.length > 0) {
      // Return paths sorted by relevance score
      return indexResults.map(r => r.path);
    }
  } catch (error) {
    // Index search failed, fall back to manual search
    console.warn(`[path-resolution] Index search failed for "${name}", falling back to slow search:`, error);
  }

  // Fallback: Manual search if index doesn't have results or search failed
  // This shouldn't happen often after initial index is built
  console.warn(`[path-resolution] Cache miss for "${name}", falling back to slow search`);

  const homeDir = os.homedir();
  const searchDirs = [
    path.join(homeDir, "Desktop"),
    path.join(homeDir, "Documents"),
    path.join(homeDir, "Downloads"),
    path.join(homeDir, "Projects"),
    homeDir,
  ];

  const results: string[] = [];
  const nameLower = name.toLowerCase();

  async function searchDir(dirPath: string, currentDepth: number): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const entryNameLower = entry.name.toLowerCase();

        // Exact match (case-insensitive)
        if (entryNameLower === nameLower) {
          if (type === "both" || (type === "file" && entry.isFile()) || (type === "directory" && entry.isDirectory())) {
            results.push(fullPath);
          }
        }

        // Fuzzy match (within 2 character difference)
        const distance = levenshteinDistance(entryNameLower, nameLower);
        if (distance <= 2 && distance > 0 && entryNameLower.length > 3) {
          if (type === "both" || (type === "file" && entry.isFile()) || (type === "directory" && entry.isDirectory())) {
            results.push(fullPath);
          }
        }

        // Recurse into directories
        if (entry.isDirectory() && currentDepth < maxDepth) {
          await searchDir(fullPath, currentDepth + 1);
        }
      }
    } catch (error) {
      // Skip directories we can't access
      return;
    }
  }

  // Search all common locations in parallel
  await Promise.all(searchDirs.map(dir => searchDir(dir, 0)));

  // Sort by relevance (exact matches first, then by distance)
  return results.sort((a, b) => {
    const aName = path.basename(a).toLowerCase();
    const bName = path.basename(b).toLowerCase();
    const aExact = aName === nameLower;
    const bExact = bName === nameLower;

    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aDist = levenshteinDistance(aName, nameLower);
    const bDist = levenshteinDistance(bName, nameLower);
    return aDist - bDist;
  });
}

/**
 * Extract potential file/directory names from user message
 */
export function extractPathReferences(message: string): Array<{ name: string; type: "file" | "directory" | "unknown" }> {
  const references: Array<{ name: string; type: "file" | "directory" | "unknown" }> = [];
  
  // Patterns to match filenames/directories
  const patterns = [
    // "edit filename.md", "open filename.txt"
    /(?:edit|open|read|show|view|find|list|delete|remove|create|write|save|modify|change|update)\s+([^\s]+\.\w+)/gi,
    // "work in directory", "change to folder"
    /(?:work\s+in|change\s+to|cd\s+to|navigate\s+to|go\s+to|list\s+files\s+in|files\s+in)\s+([^\s]+)/gi,
    // "let's edit filename"
    /let'?s\s+(?:edit|open|read|show|view|find)\s+([^\s]+)/gi,
    // Quoted paths: "filename.md" or 'filename.md'
    /["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const name = match[1].trim();
      if (name.length > 0 && !name.startsWith("http")) {
        const hasExtension = /\.\w+$/.test(name);
        references.push({
          name,
          type: hasExtension ? "file" : "unknown",
        });
      }
    }
  }

  return references;
}

/**
 * Resolve a file or directory path from user input
 * Returns the resolved path if found, null otherwise
 */
export async function resolvePath(
  userInput: string,
  workingDir: string = "~",
  type: "file" | "directory" | "both" = "both"
): Promise<{ path: string; confidence: "exact" | "fuzzy" | "relative" } | null> {
  // === SMART WORKING DIRECTORY: Use smart path resolution ===
  // First, try smart resolution (project-aware)
  try {
    const smartResolved = await resolvePathSmart(userInput, true); // preferProjectRoot = true
    const stats = await fs.stat(smartResolved);
    
    if (type === "both") {
      return { path: smartResolved, confidence: "exact" };
    }
    if (type === "file" && stats.isFile()) {
      return { path: smartResolved, confidence: "exact" };
    }
    if (type === "directory" && stats.isDirectory()) {
      return { path: smartResolved, confidence: "exact" };
    }
  } catch {
    // Smart resolution failed, continue to fallback
  }

  // Fallback: Try as-is (might be absolute path)
  try {
    const normalized = normalizePath(userInput, workingDir);
    const stats = await fs.stat(normalized);
    
    if (type === "both") {
      return { path: normalized, confidence: "exact" };
    }
    if (type === "file" && stats.isFile()) {
      return { path: normalized, confidence: "exact" };
    }
    if (type === "directory" && stats.isDirectory()) {
      return { path: normalized, confidence: "exact" };
    }
  } catch {
    // Path doesn't exist, continue to search
  }

  // Try relative to working directory (using smart manager if available)
  if (!userInput.startsWith("/") && !userInput.startsWith("~")) {
    try {
      // Try smart resolution first
      const smartRelative = await resolvePathSmart(userInput, false); // preferProjectRoot = false
      const stats = await fs.stat(smartRelative);
      
      if (type === "both") {
        return { path: smartRelative, confidence: "relative" };
      }
      if (type === "file" && stats.isFile()) {
        return { path: smartRelative, confidence: "relative" };
      }
      if (type === "directory" && stats.isDirectory()) {
        return { path: smartRelative, confidence: "relative" };
      }
    } catch {
      // Smart relative failed, try basic relative
      try {
        const relativePath = normalizePath(userInput, workingDir);
        const stats = await fs.stat(relativePath);
        
        if (type === "both") {
          return { path: relativePath, confidence: "relative" };
        }
        if (type === "file" && stats.isFile()) {
          return { path: relativePath, confidence: "relative" };
        }
        if (type === "directory" && stats.isDirectory()) {
          return { path: relativePath, confidence: "relative" };
        }
      } catch {
        // Relative path doesn't exist, continue to search
      }
    }
  }

  // Search in common locations
  const searchResults = await searchInCommonLocations(userInput, type);
  
  if (searchResults.length > 0) {
    // Verify each result actually exists before returning
    for (const resultPath of searchResults) {
      try {
        const stats = await fs.stat(resultPath);
        const isValid = type === "both" || 
          (type === "file" && stats.isFile()) || 
          (type === "directory" && stats.isDirectory());
        
        if (isValid) {
          // Prefer exact matches
          const isExact = path.basename(resultPath).toLowerCase() === userInput.toLowerCase();
          return { 
            path: resultPath, 
            confidence: isExact ? "exact" : "fuzzy" 
          };
        }
      } catch {
        // File doesn't exist or can't access, skip to next
        continue;
      }
    }
  }

  return null;
}

/**
 * Preprocess user message to find and inject resolved paths
 */
export async function preprocessUserMessage(
  message: string,
  workingDir: string = "~"
): Promise<{ 
  processedMessage: string; 
  resolvedPaths: Array<{ original: string; resolved: string; confidence: string }>;
  pathContext: string;
}> {
  const references = extractPathReferences(message);
  const resolvedPaths: Array<{ original: string; resolved: string; confidence: string }> = [];
  const pathContextParts: string[] = [];

  for (const ref of references) {
    const resolved = await resolvePath(ref.name, workingDir, ref.type === "file" ? "file" : ref.type === "directory" ? "directory" : "both");
    
    if (resolved) {
      resolvedPaths.push({
        original: ref.name,
        resolved: resolved.path,
        confidence: resolved.confidence,
      });
      
      if (resolved.confidence === "fuzzy") {
        pathContextParts.push(`Note: User mentioned "${ref.name}", found at ${resolved.path} (fuzzy match)`);
      } else {
        pathContextParts.push(`User mentioned "${ref.name}", resolved to: ${resolved.path}`);
      }
    }
  }

  const pathContext = pathContextParts.length > 0
    ? `\n\n📁 PATH RESOLUTION:\n${pathContextParts.join("\n")}\n\nUse these resolved paths in your tool calls.`
    : "";

  return {
    processedMessage: message,
    resolvedPaths,
    pathContext,
  };
}

