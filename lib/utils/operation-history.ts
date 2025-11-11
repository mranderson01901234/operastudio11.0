/**
 * Undo/Rollback System
 * Snapshot files before destructive operations for safe rollback
 *
 * Philosophy: Safety net for destructive operations
 * - Create snapshots before fs_write, fs_delete
 * - Allow users to undo mistakes
 * - Auto-cleanup old snapshots
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export interface Snapshot {
  id: string;
  timestamp: number;
  operation: "write" | "delete";
  targetPath: string;
  backupPath: string | null; // null for newly created files
  metadata: {
    size?: number;
    isDirectory?: boolean;
    mtime?: number;
  };
  canRestore: boolean;
}

export interface OperationHistoryEntry {
  id: string;
  timestamp: number;
  operation: string; // Tool name
  arguments: Record<string, unknown>;
  snapshot?: Snapshot;
  result: "success" | "error";
  error?: string;
}

class OperationHistory {
  private history: OperationHistoryEntry[] = [];
  private snapshots: Map<string, Snapshot> = new Map();
  private readonly SNAPSHOT_DIR: string;
  private readonly MAX_HISTORY = 100;
  private readonly MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.SNAPSHOT_DIR = path.join(os.tmpdir(), "operastudio-snapshots");
    this.initializeSnapshotDir();
  }

  /**
   * Initialize snapshot directory
   */
  private async initializeSnapshotDir(): Promise<void> {
    try {
      await fs.mkdir(this.SNAPSHOT_DIR, { recursive: true });
      console.log(`[Operation History] Snapshot directory: ${this.SNAPSHOT_DIR}`);

      // Cleanup old snapshots on init
      await this.cleanupOldSnapshots();
    } catch (error) {
      console.error("[Operation History] Failed to initialize snapshot directory:", error);
    }
  }

  /**
   * Create snapshot before destructive operation
   */
  async createSnapshot(
    operation: "write" | "delete",
    targetPath: string
  ): Promise<Snapshot | null> {
    try {
      const snapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      let backupPath: string | null = null;
      let metadata: Snapshot["metadata"] = {};

      // Check if target exists
      try {
        const stats = await fs.stat(targetPath);
        metadata = {
          size: stats.size,
          isDirectory: stats.isDirectory(),
          mtime: stats.mtimeMs,
        };

        // Create backup copy
        if (stats.isDirectory()) {
          // For directories, create a tar-like backup
          backupPath = path.join(this.SNAPSHOT_DIR, `${snapshotId}_dir`);
          await fs.mkdir(backupPath, { recursive: true });
          await this.copyDirectory(targetPath, backupPath);
        } else {
          // For files, simple copy
          backupPath = path.join(this.SNAPSHOT_DIR, snapshotId);
          await fs.copyFile(targetPath, backupPath);
        }

        console.log(`[Operation History] 📸 Created snapshot: ${targetPath} → ${backupPath}`);
      } catch (error) {
        // Target doesn't exist (e.g., new file being created)
        backupPath = null;
        console.log(`[Operation History] 📸 Snapshot for new file: ${targetPath}`);
      }

      const snapshot: Snapshot = {
        id: snapshotId,
        timestamp: Date.now(),
        operation,
        targetPath,
        backupPath,
        metadata,
        canRestore: backupPath !== null,
      };

      this.snapshots.set(snapshotId, snapshot);

      return snapshot;
    } catch (error) {
      console.error("[Operation History] Failed to create snapshot:", error);
      return null;
    }
  }

  /**
   * Recursively copy directory
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Recursively delete directory
   */
  private async deleteDirectory(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.deleteDirectory(fullPath);
      } else {
        await fs.unlink(fullPath);
      }
    }

    await fs.rmdir(dirPath);
  }

  /**
   * Record operation in history
   */
  recordOperation(
    operation: string,
    args: Record<string, unknown>,
    result: "success" | "error",
    snapshot?: Snapshot,
    error?: string
  ): string {
    const entryId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const entry: OperationHistoryEntry = {
      id: entryId,
      timestamp: Date.now(),
      operation,
      arguments: args,
      snapshot,
      result,
      error,
    };

    this.history.push(entry);

    // Trim history if too long
    if (this.history.length > this.MAX_HISTORY) {
      const removed = this.history.shift();
      // Cleanup snapshot if exists
      if (removed?.snapshot) {
        this.deleteSnapshot(removed.snapshot.id);
      }
    }

    return entryId;
  }

  /**
   * Restore from snapshot (undo operation)
   */
  async restoreSnapshot(snapshotId: string): Promise<{ success: boolean; error?: string }> {
    const snapshot = this.snapshots.get(snapshotId);

    if (!snapshot) {
      return { success: false, error: "Snapshot not found" };
    }

    if (!snapshot.canRestore) {
      return { success: false, error: "Cannot restore: file did not exist before operation" };
    }

    try {
      if (snapshot.metadata.isDirectory && snapshot.backupPath) {
        // Restore directory
        // First, delete current directory if it exists
        try {
          await this.deleteDirectory(snapshot.targetPath);
        } catch {
          // Directory might not exist
        }

        // Restore from backup
        await this.copyDirectory(snapshot.backupPath, snapshot.targetPath);
      } else if (snapshot.backupPath) {
        // Restore file
        await fs.copyFile(snapshot.backupPath, snapshot.targetPath);

        // Restore original mtime if available
        if (snapshot.metadata.mtime) {
          await fs.utimes(snapshot.targetPath, new Date(), new Date(snapshot.metadata.mtime));
        }
      }

      console.log(`[Operation History] ✅ Restored: ${snapshot.targetPath} from ${snapshot.backupPath}`);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Undo last operation
   */
  async undoLast(): Promise<{ success: boolean; operation?: string; error?: string }> {
    // Find last successful operation with a snapshot
    for (let i = this.history.length - 1; i >= 0; i--) {
      const entry = this.history[i];

      if (entry.result === "success" && entry.snapshot) {
        const restoreResult = await this.restoreSnapshot(entry.snapshot.id);

        if (restoreResult.success) {
          return {
            success: true,
            operation: entry.operation,
          };
        } else {
          return {
            success: false,
            error: restoreResult.error,
          };
        }
      }
    }

    return {
      success: false,
      error: "No operations to undo",
    };
  }

  /**
   * Get recent operations
   */
  getRecentOperations(limit: number = 10): OperationHistoryEntry[] {
    return this.history.slice(-limit).reverse();
  }

  /**
   * Delete snapshot
   */
  private async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots.get(snapshotId);

    if (snapshot && snapshot.backupPath) {
      try {
        if (snapshot.metadata.isDirectory) {
          await this.deleteDirectory(snapshot.backupPath);
        } else {
          await fs.unlink(snapshot.backupPath);
        }

        this.snapshots.delete(snapshotId);

        console.log(`[Operation History] 🗑️  Deleted snapshot: ${snapshotId}`);
      } catch (error) {
        console.error(`[Operation History] Failed to delete snapshot ${snapshotId}:`, error);
      }
    }
  }

  /**
   * Cleanup old snapshots
   */
  async cleanupOldSnapshots(): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, snapshot] of this.snapshots.entries()) {
      if (now - snapshot.timestamp > this.MAX_SNAPSHOT_AGE_MS) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      await this.deleteSnapshot(id);
    }

    if (toDelete.length > 0) {
      console.log(`[Operation History] Cleaned up ${toDelete.length} old snapshots`);
    }
  }

  /**
   * Get history summary
   */
  getSummary(): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    snapshotsCount: number;
    oldestSnapshot: number | null;
  } {
    const successful = this.history.filter((e) => e.result === "success").length;
    const failed = this.history.filter((e) => e.result === "error").length;

    let oldestSnapshot: number | null = null;
    for (const snapshot of this.snapshots.values()) {
      if (oldestSnapshot === null || snapshot.timestamp < oldestSnapshot) {
        oldestSnapshot = snapshot.timestamp;
      }
    }

    return {
      totalOperations: this.history.length,
      successfulOperations: successful,
      failedOperations: failed,
      snapshotsCount: this.snapshots.size,
      oldestSnapshot,
    };
  }

  /**
   * Clear all history and snapshots
   */
  async clearAll(): Promise<void> {
    // Delete all snapshots
    for (const id of this.snapshots.keys()) {
      await this.deleteSnapshot(id);
    }

    this.history = [];
    this.snapshots.clear();

    console.log("[Operation History] All history and snapshots cleared");
  }
}

// Singleton instance
export const operationHistory = new OperationHistory();

/**
 * Helper: Create snapshot before destructive operation
 */
export async function snapshotBeforeOperation(
  operation: "write" | "delete",
  targetPath: string
): Promise<Snapshot | null> {
  return operationHistory.createSnapshot(operation, targetPath);
}

/**
 * Helper: Record operation with optional snapshot
 */
export function recordOperation(
  operation: string,
  args: Record<string, unknown>,
  result: "success" | "error",
  snapshot?: Snapshot,
  error?: string
): string {
  return operationHistory.recordOperation(operation, args, result, snapshot, error);
}

/**
 * Helper: Undo last operation
 */
export async function undoLastOperation(): Promise<{
  success: boolean;
  operation?: string;
  error?: string;
}> {
  return operationHistory.undoLast();
}

/**
 * Helper: Get operation history
 */
export function getOperationHistory(limit: number = 10): OperationHistoryEntry[] {
  return operationHistory.getRecentOperations(limit);
}
