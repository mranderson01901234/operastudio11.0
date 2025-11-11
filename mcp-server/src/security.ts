import type { SecurityMode } from "./types.js";
import * as path from "path";
import * as os from "os";

/**
 * Security policy enforcement based on mode
 */
export class SecurityPolicy {
  private mode: SecurityMode;
  private allowedPaths: string[];
  private deniedPaths: string[];
  private userHome: string;

  constructor(mode: SecurityMode, allowedPaths?: string[], deniedPaths?: string[]) {
    this.mode = mode;
    this.userHome = os.homedir();
    this.allowedPaths = allowedPaths || [];
    this.deniedPaths = deniedPaths || this.getDefaultDeniedPaths();
  }

  /**
   * Get default denied paths based on OS
   */
  private getDefaultDeniedPaths(): string[] {
    const systemRoots = [
      "/etc",
      "/usr",
      "/bin",
      "/sbin",
      "/lib",
      "/lib64",
      "/sys",
      "/proc",
      "/dev",
      "/boot",
      "/root",
    ];

    if (process.platform === "win32") {
      return [
        "C:\\Windows",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
        "C:\\ProgramData",
        "C:\\System32",
      ];
    }

    return systemRoots;
  }

  /**
   * Check if a path is allowed
   */
  isPathAllowed(filePath: string): { allowed: boolean; reason?: string } {
    const normalizedPath = path.resolve(filePath);

    // Check denied paths
    for (const denied of this.deniedPaths) {
      if (normalizedPath.startsWith(path.resolve(denied))) {
        return { allowed: false, reason: "Path is in denied list" };
      }
    }

    // Safe mode: Only allow user home directory
    if (this.mode === "SAFE") {
      if (!normalizedPath.startsWith(this.userHome)) {
        return { allowed: false, reason: "Safe mode: Only home directory allowed" };
      }
    }

    // Balanced mode: Allow user home + common dev directories
    if (this.mode === "BALANCED") {
      const allowedInBalanced = [
        this.userHome,
        path.join(this.userHome, "Desktop"),
        path.join(this.userHome, "Documents"),
        path.join(this.userHome, "Projects"),
        path.join(this.userHome, "workspace"),
      ];

      const isAllowed = allowedInBalanced.some((allowed) =>
        normalizedPath.startsWith(path.resolve(allowed))
      );

      if (!isAllowed) {
        return { allowed: false, reason: "Balanced mode: Path not in allowed list" };
      }
    }

    // Unrestricted: All paths allowed (except denied)
    return { allowed: true };
  }

  /**
   * Check if command execution is allowed
   */
  isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
    if (this.mode === "SAFE") {
      return { allowed: false, reason: "Safe mode: Command execution not allowed" };
    }

    if (this.mode === "BALANCED") {
      // Whitelist of safe commands
      const allowedCommands = [
        // Development tools
        "git",
        "npm",
        "yarn",
        "pnpm",
        "node",
        "python",
        "python3",
        // File system utilities (read-only)
        "ls",
        "cat",
        "grep",
        "find",
        "which",      // Locate command in PATH (read-only)
        "whereis",    // Locate binaries, source, manuals (read-only)
        "type",       // Show command type (read-only, bash builtin)
        "pwd",        // Print working directory (read-only)
        "echo",       // Print text (harmless)
        "uname",      // System information (read-only)
        "date",       // Show date/time (read-only)
        "head",       // Show first lines (read-only)
        "tail",       // Show last lines (read-only)
        "wc",         // Word count (read-only)
        "sort",       // Sort lines (read-only)
        "uniq",       // Remove duplicates (read-only)
        "cut",        // Extract columns (read-only)
        "awk",        // Text processing (read-only when used safely)
        "sed",        // Stream editor (read-only when used safely)
        // Package managers (for checking/installing)
        "apt",        // APT package manager
        "snap",       // Snap package manager
        "brew",       // Homebrew (macOS)
        "dpkg",       // Debian package manager
        // System utilities
        "ps",         // Process list (read-only)
        "top",        // Process monitor (read-only)
        "df",         // Disk space (read-only)
        "du",         // Directory size (read-only)
        "free",       // Memory info (read-only)
      ];

      const cmdName = command.split(" ")[0];
      if (!allowedCommands.includes(cmdName)) {
        return {
          allowed: false,
          reason: `Balanced mode: Command '${cmdName}' not in allowed list`,
        };
      }
    }

    // Unrestricted: All commands allowed
    return { allowed: true };
  }

  /**
   * Check if file write is allowed
   */
  isWriteAllowed(filePath: string): { allowed: boolean; reason?: string } {
    const pathCheck = this.isPathAllowed(filePath);
    if (!pathCheck.allowed) {
      return pathCheck;
    }

    // Safe mode: Read-only
    if (this.mode === "SAFE") {
      return { allowed: false, reason: "Safe mode: Write operations not allowed" };
    }

    return { allowed: true };
  }
}

