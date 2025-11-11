/**
 * Smart Working Directory Manager
 * Context-aware working directory with history and intelligent switching
 *
 * Philosophy: Remember where the user was working to reduce path confusion
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export interface DirectoryHistoryEntry {
  path: string;
  timestamp: number;
  context?: string; // What was the user doing?
  projectRoot?: string; // Detected project root
}

export interface WorkingDirectoryState {
  current: string;
  previous: string | null;
  history: DirectoryHistoryEntry[];
  projectRoots: Set<string>; // Detected project roots
}

class WorkingDirectoryManager {
  private state: WorkingDirectoryState;
  private readonly MAX_HISTORY = 50;

  constructor() {
    this.state = {
      current: process.cwd(),
      previous: null,
      history: [
        {
          path: process.cwd(),
          timestamp: Date.now(),
          context: "initial",
        },
      ],
      projectRoots: new Set(),
    };
  }

  /**
   * Get current working directory
   */
  getCurrent(): string {
    return this.state.current;
  }

  /**
   * Get previous working directory
   */
  getPrevious(): string | null {
    return this.state.previous;
  }

  /**
   * Get directory history
   */
  getHistory(): DirectoryHistoryEntry[] {
    return [...this.state.history];
  }

  /**
   * Change working directory
   */
  async changeDirectory(
    newPath: string,
    context?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Expand ~ and resolve path
      let resolvedPath = newPath.trim();
      if (resolvedPath.startsWith("~")) {
        resolvedPath = resolvedPath.replace("~", os.homedir());
      }
      resolvedPath = path.resolve(this.state.current, resolvedPath);

      // Check if directory exists
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Not a directory: ${resolvedPath}`,
        };
      }

      // Update state
      this.state.previous = this.state.current;
      this.state.current = resolvedPath;

      // Detect project root
      const projectRoot = await this.detectProjectRoot(resolvedPath);

      // Add to history
      this.state.history.push({
        path: resolvedPath,
        timestamp: Date.now(),
        context,
        projectRoot,
      });

      // Track project root
      if (projectRoot) {
        this.state.projectRoots.add(projectRoot);
      }

      // Trim history if too long
      if (this.state.history.length > this.MAX_HISTORY) {
        this.state.history = this.state.history.slice(-this.MAX_HISTORY);
      }

      console.log(`[Working Dir] Changed to: ${resolvedPath}`);
      if (projectRoot) {
        console.log(`[Working Dir] Detected project: ${projectRoot}`);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Go back to previous directory
   */
  async goBack(): Promise<{ success: boolean; error?: string }> {
    if (!this.state.previous) {
      return {
        success: false,
        error: "No previous directory",
      };
    }

    return this.changeDirectory(this.state.previous, "go_back");
  }

  /**
   * Detect project root by looking for markers
   */
  private async detectProjectRoot(startPath: string): Promise<string | null> {
    const projectMarkers = [
      "package.json",
      ".git",
      "Cargo.toml",
      "go.mod",
      "pom.xml",
      "composer.json",
      "Makefile",
      "pyproject.toml",
      "setup.py",
    ];

    let currentPath = startPath;

    // Search up to 5 levels up
    for (let i = 0; i < 5; i++) {
      for (const marker of projectMarkers) {
        const markerPath = path.join(currentPath, marker);
        try {
          await fs.access(markerPath);
          // Found a project marker
          return currentPath;
        } catch {
          // Marker doesn't exist, continue
        }
      }

      // Move up one directory
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        // Reached root
        break;
      }
      currentPath = parentPath;
    }

    return null;
  }

  /**
   * Smart path resolution with context awareness
   */
  async resolvePath(
    pathStr: string,
    preferProjectRoot: boolean = true
  ): Promise<string> {
    let resolvedPath = pathStr.trim();

    // Expand ~
    if (resolvedPath.startsWith("~")) {
      resolvedPath = resolvedPath.replace("~", os.homedir());
    }

    // If already absolute, return as-is
    if (path.isAbsolute(resolvedPath)) {
      return resolvedPath;
    }

    // Special shortcuts
    if (resolvedPath === "-") {
      // "-" means previous directory (like cd -)
      return this.state.previous || this.state.current;
    }

    // If relative path, resolve against appropriate base
    if (preferProjectRoot) {
      // Try to resolve against project root first
      const currentEntry = this.state.history[this.state.history.length - 1];
      if (currentEntry.projectRoot) {
        const projectPath = path.resolve(currentEntry.projectRoot, resolvedPath);
        try {
          await fs.access(projectPath);
          return projectPath;
        } catch {
          // File doesn't exist in project root, fall through
        }
      }
    }

    // Default: resolve against current working directory
    return path.resolve(this.state.current, resolvedPath);
  }

  /**
   * Find directory in history by context or path
   */
  findInHistory(query: string): DirectoryHistoryEntry | null {
    const queryLower = query.toLowerCase();

    // Search in reverse (most recent first)
    for (let i = this.state.history.length - 1; i >= 0; i--) {
      const entry = this.state.history[i];

      // Match by path
      if (entry.path.toLowerCase().includes(queryLower)) {
        return entry;
      }

      // Match by context
      if (entry.context && entry.context.toLowerCase().includes(queryLower)) {
        return entry;
      }

      // Match by project root
      if (entry.projectRoot && entry.projectRoot.toLowerCase().includes(queryLower)) {
        return entry;
      }
    }

    return null;
  }

  /**
   * Get suggested directories based on recent activity
   */
  getSuggestions(limit: number = 5): string[] {
    const suggestions = new Set<string>();

    // Add current directory
    suggestions.add(this.state.current);

    // Add previous directory
    if (this.state.previous) {
      suggestions.add(this.state.previous);
    }

    // Add project roots
    for (const root of this.state.projectRoots) {
      suggestions.add(root);
    }

    // Add recent directories from history
    for (let i = this.state.history.length - 1; i >= 0 && suggestions.size < limit; i--) {
      suggestions.add(this.state.history[i].path);
    }

    return Array.from(suggestions).slice(0, limit);
  }

  /**
   * Get context-aware directory description
   */
  getDirectoryDescription(dirPath: string): string {
    // Find in history
    const entry = this.state.history.find((e) => e.path === dirPath);

    if (!entry) {
      return path.basename(dirPath);
    }

    const parts: string[] = [path.basename(dirPath)];

    if (entry.projectRoot && entry.projectRoot !== dirPath) {
      const projectName = path.basename(entry.projectRoot);
      parts.push(`(project: ${projectName})`);
    }

    if (entry.context) {
      parts.push(`[${entry.context}]`);
    }

    return parts.join(" ");
  }

  /**
   * Export state (for persistence)
   */
  exportState(): WorkingDirectoryState {
    return {
      current: this.state.current,
      previous: this.state.previous,
      history: [...this.state.history],
      projectRoots: new Set(this.state.projectRoots),
    };
  }

  /**
   * Import state (from persistence)
   */
  importState(state: WorkingDirectoryState): void {
    this.state = {
      current: state.current,
      previous: state.previous,
      history: [...state.history],
      projectRoots: new Set(state.projectRoots),
    };

    console.log(`[Working Dir] Restored state: ${this.state.current}`);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.state.history = [
      {
        path: this.state.current,
        timestamp: Date.now(),
        context: "history_cleared",
      },
    ];
    this.state.projectRoots.clear();
    console.log(`[Working Dir] History cleared`);
  }
}

// Singleton instance
export const workingDirectoryManager = new WorkingDirectoryManager();

/**
 * Helper function to change directory with automatic history tracking
 */
export async function changeWorkingDirectory(
  newPath: string,
  context?: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  const result = await workingDirectoryManager.changeDirectory(newPath, context);

  if (result.success) {
    return {
      success: true,
      path: workingDirectoryManager.getCurrent(),
    };
  }

  return result;
}

/**
 * Helper function to get current working directory
 */
export function getCurrentWorkingDirectory(): string {
  return workingDirectoryManager.getCurrent();
}

/**
 * Helper function to resolve paths with context awareness
 */
export async function resolvePathSmart(
  pathStr: string,
  preferProjectRoot: boolean = true
): Promise<string> {
  return workingDirectoryManager.resolvePath(pathStr, preferProjectRoot);
}
