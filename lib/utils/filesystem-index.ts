/**
 * Filesystem Index Cache
 * Provides fast (<5ms) lookups for files and directories
 * Auto-refreshes in background to stay up-to-date
 * 
 * NOTE: This module is server-only (uses Node.js fs)
 */

// Server-only check
if (typeof window !== "undefined") {
  throw new Error("filesystem-index.ts can only be used server-side");
}

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import type { FSWatcher } from "fs";

interface FileEntry {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  lastModified: number;
}

interface FuzzyHash {
  normalized: string;  // lowercase, no special chars
  original: string;
}

class FilesystemIndex {
  // Fast lookups
  private filesByName = new Map<string, Set<string>>();  // filename -> Set of full paths
  private dirsByName = new Map<string, Set<string>>();   // dirname -> Set of full paths
  private fuzzyMap = new Map<string, Set<string>>();     // fuzzy hash -> Set of full paths

  // Metadata
  private lastIndexed: number = 0;
  private indexing: boolean = false;
  private watchers: FSWatcher[] = [];

  // Configuration
  private readonly MAX_DEPTH = 4;
  private readonly INDEX_INTERVAL = 5 * 60 * 1000; // Re-index every 5 minutes
  private readonly COMMON_DIRS: string[];

  constructor() {
    const homeDir = os.homedir();
    this.COMMON_DIRS = [
      path.join(homeDir, "Desktop"),
      path.join(homeDir, "Documents"),
      path.join(homeDir, "Downloads"),
      path.join(homeDir, "Projects"),
      path.join(homeDir, "dev"),
      path.join(homeDir, "workspace"),
      homeDir,
    ];
  }

  /**
   * Generate fuzzy hash for matching
   */
  private fuzzyHash(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")  // Remove special chars
      .trim();
  }

  /**
   * Calculate similarity score (0-1)
   */
  private similarityScore(str1: string, str2: string): number {
    const hash1 = this.fuzzyHash(str1);
    const hash2 = this.fuzzyHash(str2);

    if (hash1 === hash2) return 1.0;

    // Levenshtein distance ratio
    const maxLen = Math.max(hash1.length, hash2.length);
    if (maxLen === 0) return 1.0;

    const distance = this.levenshtein(hash1, hash2);
    return 1 - (distance / maxLen);
  }

  /**
   * Levenshtein distance
   */
  private levenshtein(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) matrix[i] = [i];
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Add entry to index
   */
  private addToIndex(entry: FileEntry): void {
    const name = path.basename(entry.fullPath);
    const nameLower = name.toLowerCase();
    const fuzzy = this.fuzzyHash(name);

    if (entry.isDirectory) {
      if (!this.dirsByName.has(nameLower)) {
        this.dirsByName.set(nameLower, new Set());
      }
      this.dirsByName.get(nameLower)!.add(entry.fullPath);
    } else {
      if (!this.filesByName.has(nameLower)) {
        this.filesByName.set(nameLower, new Set());
      }
      this.filesByName.get(nameLower)!.add(entry.fullPath);
    }

    // Add to fuzzy map
    if (!this.fuzzyMap.has(fuzzy)) {
      this.fuzzyMap.set(fuzzy, new Set());
    }
    this.fuzzyMap.get(fuzzy)!.add(entry.fullPath);
  }

  /**
   * Recursively index a directory
   */
  private async indexDirectory(dirPath: string, currentDepth: number = 0): Promise<void> {
    if (currentDepth > this.MAX_DEPTH) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files and common junk directories
        if (entry.name.startsWith(".")) continue;
        if (["node_modules", "dist", "build", ".git", ".next"].includes(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);

        try {
          const stats = await fs.stat(fullPath);

          this.addToIndex({
            name: entry.name,
            fullPath,
            isDirectory: entry.isDirectory(),
            lastModified: stats.mtimeMs,
          });

          // Recurse into directories
          if (entry.isDirectory() && currentDepth < this.MAX_DEPTH) {
            await this.indexDirectory(fullPath, currentDepth + 1);
          }
        } catch (error) {
          // Skip files/dirs we can't access
          continue;
        }
      }
    } catch (error) {
      // Skip directories we can't read
      return;
    }
  }

  /**
   * Build the full filesystem index
   */
  async buildIndex(): Promise<void> {
    if (this.indexing) {
      console.log("[FilesystemIndex] Already indexing, skipping...");
      return;
    }

    this.indexing = true;
    const startTime = Date.now();

    console.log("[FilesystemIndex] Starting filesystem index...");

    // Clear existing index
    this.filesByName.clear();
    this.dirsByName.clear();
    this.fuzzyMap.clear();

    // Index all common directories in parallel
    await Promise.all(
      this.COMMON_DIRS.map(dir => this.indexDirectory(dir, 0).catch(() => {}))
    );

    this.lastIndexed = Date.now();
    this.indexing = false;

    const duration = Date.now() - startTime;
    const totalFiles = Array.from(this.filesByName.values()).reduce((sum, set) => sum + set.size, 0);
    const totalDirs = Array.from(this.dirsByName.values()).reduce((sum, set) => sum + set.size, 0);

    console.log(`[FilesystemIndex] Index complete: ${totalFiles} files, ${totalDirs} directories in ${duration}ms`);
  }

  /**
   * Search for a file or directory by name
   * Returns array of matches sorted by relevance
   */
  search(
    query: string,
    type: "file" | "directory" | "both" = "both",
    maxResults: number = 10
  ): Array<{ path: string; score: number; matchType: "exact" | "fuzzy" }> {
    const queryLower = query.toLowerCase();
    const queryFuzzy = this.fuzzyHash(query);
    const results: Array<{ path: string; score: number; matchType: "exact" | "fuzzy" }> = [];

    // 1. Exact matches (highest priority)
    if (type === "file" || type === "both") {
      const exactFiles = this.filesByName.get(queryLower);
      if (exactFiles) {
        exactFiles.forEach(p => results.push({ path: p, score: 1.0, matchType: "exact" }));
      }
    }

    if (type === "directory" || type === "both") {
      const exactDirs = this.dirsByName.get(queryLower);
      if (exactDirs) {
        exactDirs.forEach(p => results.push({ path: p, score: 1.0, matchType: "exact" }));
      }
    }

    // 2. Fuzzy matches (if not enough exact matches)
    if (results.length < maxResults) {
      const fuzzyPaths = this.fuzzyMap.get(queryFuzzy) || new Set();
      fuzzyPaths.forEach(p => {
        if (!results.find(r => r.path === p)) {
          const basename = path.basename(p);
          const score = this.similarityScore(basename, query);
          if (score > 0.6) {  // Only include if reasonably similar
            results.push({ path: p, score, matchType: "fuzzy" });
          }
        }
      });

      // Also check partial fuzzy matches
      for (const [hash, paths] of this.fuzzyMap.entries()) {
        if (hash.includes(queryFuzzy) || queryFuzzy.includes(hash)) {
          paths.forEach(p => {
            if (!results.find(r => r.path === p)) {
              const basename = path.basename(p);
              const score = this.similarityScore(basename, query);
              if (score > 0.5) {
                results.push({ path: p, score, matchType: "fuzzy" });
              }
            }
          });
        }
      }
    }

    // Sort by score (descending) and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Get index stats
   */
  getStats(): { files: number; directories: number; lastIndexed: Date | null; indexing: boolean } {
    const files = Array.from(this.filesByName.values()).reduce((sum, set) => sum + set.size, 0);
    const directories = Array.from(this.dirsByName.values()).reduce((sum, set) => sum + set.size, 0);

    return {
      files,
      directories,
      lastIndexed: this.lastIndexed > 0 ? new Date(this.lastIndexed) : null,
      indexing: this.indexing,
    };
  }

  /**
   * Start automatic background indexing
   */
  startAutoIndex(): void {
    // Initial index (non-blocking, with error handling)
    this.buildIndex().catch((error) => {
      console.error("[FilesystemIndex] Initial indexing failed:", error);
      // Don't crash - index will be built lazily on first search
    });

    // Re-index periodically
    setInterval(() => {
      this.buildIndex().catch((error) => {
        console.error("[FilesystemIndex] Periodic indexing failed:", error);
        // Don't crash - continue with existing index
      });
    }, this.INDEX_INTERVAL);

    console.log("[FilesystemIndex] Auto-indexing enabled");
  }

  /**
   * Check if index needs refresh
   */
  needsRefresh(): boolean {
    const age = Date.now() - this.lastIndexed;
    return age > this.INDEX_INTERVAL || this.lastIndexed === 0;
  }
}

// Singleton instance
export const filesystemIndex = new FilesystemIndex();

// Auto-start indexing on import (only in Node.js environment)
// Wrap in try-catch to prevent import errors from crashing the server
if (typeof window === "undefined") {
  try {
    filesystemIndex.startAutoIndex();
  } catch (error) {
    console.error("[FilesystemIndex] Failed to start auto-indexing:", error);
    // Don't crash - index will be built lazily on first search
  }
}
