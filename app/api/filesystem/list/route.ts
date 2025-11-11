import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { LRUCache } from "lru-cache";

type SecurityMode = "SAFE" | "BALANCED" | "UNRESTRICTED";

// LRU cache for directory listings (improves performance for repeated requests)
const dirListCache = new LRUCache<string, {
  items: Array<{
    path: string;
    type: "file" | "directory";
    size: number;
    mtime: string;
  }>;
}>({
  max: 500, // Cache up to 500 directory listings
  ttl: 30000, // 30 seconds TTL
  updateAgeOnGet: true, // Refresh TTL on cache hit
});

/**
 * Security policy enforcement (simplified version for API route)
 */
class SecurityPolicy {
  private mode: SecurityMode;
  private userHome: string;
  private deniedPaths: string[];

  constructor(mode: SecurityMode) {
    this.mode = mode;
    this.userHome = os.homedir();
    this.deniedPaths = this.getDefaultDeniedPaths();
  }

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
}

/**
 * List directory contents
 */
async function listDirectory(
  dirPath: string,
  depth: number,
  includeHidden: boolean,
  security: SecurityPolicy
): Promise<{
  items: Array<{
    path: string;
    type: "file" | "directory";
    size: number;
    mtime: string;
  }>;
}> {
  // Check security
  const pathCheck = security.isPathAllowed(dirPath);
  if (!pathCheck.allowed) {
    throw new Error(`PERMISSION_DENIED: ${pathCheck.reason}`);
  }

  // Check if directory exists
  let stats;
  try {
    stats = await fs.stat(dirPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`NOT_FOUND: Directory not found: ${dirPath}`);
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    throw new Error(`NOT_FOUND: Path is not a directory: ${dirPath}`);
  }

  const items: Array<{
    path: string;
    type: "file" | "directory";
    size: number;
    mtime: string;
  }> = [];

  async function scanDir(currentPath: string, currentDepth: number) {
    if (currentDepth > depth) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files if not requested
      if (!includeHidden && entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      
      // Check security for each item
      const itemCheck = security.isPathAllowed(fullPath);
      if (!itemCheck.allowed) {
        continue; // Skip denied items
      }

      try {
        const itemStats = await fs.stat(fullPath);

        items.push({
          path: fullPath,
          type: entry.isDirectory() ? "directory" : "file",
          size: itemStats.size,
          mtime: itemStats.mtime.toISOString(),
        });

        // Recurse into directories
        if (entry.isDirectory() && currentDepth < depth) {
          await scanDir(fullPath, currentDepth + 1);
        }
      } catch (error) {
        // Skip items we can't access
        console.warn(`Skipping ${fullPath}:`, error);
      }
    }
  }

  await scanDir(dirPath, 0);

  return { items };
}

/**
 * GET /api/filesystem/list
 * 
 * Lists directory contents using MCP file system tools
 * 
 * Query params: path, depth, includeHidden
 * Output: {items: [{path, type, size, mtime}]}
 * Auth: Clerk session required
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    let dirPath = searchParams.get("path") || "~";
    const depth = parseInt(searchParams.get("depth") || "1", 10);
    const includeHidden = searchParams.get("includeHidden") === "true";

    // Get user's active session to determine security mode
    const session = await prisma.localSession.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        serverType: "filesystem",
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    // Use session mode if available, otherwise default to BALANCED
    const mode = (session?.mode as SecurityMode) || "BALANCED";

    // Resolve ~ to home directory
    if (dirPath === "~" || dirPath.startsWith("~/")) {
      const homeDir = os.homedir();
      dirPath = dirPath === "~" ? homeDir : path.join(homeDir, dirPath.slice(2));
    }

    // Create security policy with user's actual session mode
    const security = new SecurityPolicy(mode);

    // Create cache key including userId to prevent cross-user leakage
    const cacheKey = `${userId}:${dirPath}:${depth}:${includeHidden}:${mode}`;

    // Check cache first
    const cached = dirListCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          "X-Cache": "HIT",
        },
      });
    }

    // List directory
    const result = await listDirectory(dirPath, depth, includeHidden, security);

    // Cache the result
    dirListCache.set(cacheKey, result);

    return NextResponse.json(result, {
      headers: {
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("Error listing directory:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log full error details for debugging
    console.error("Full error details:", {
      message: errorMessage,
      stack: errorStack,
      error: error,
    });
    
    // Check for specific error types
    if (errorMessage.includes("PERMISSION_DENIED")) {
      return NextResponse.json(
        { error: "Permission denied", details: errorMessage },
        { status: 403 }
      );
    }
    if (errorMessage.includes("NOT_FOUND")) {
      return NextResponse.json(
        { error: "Directory not found", details: errorMessage },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { 
        error: "Failed to list directory", 
        details: errorMessage,
        // Include stack in development
        ...(process.env.NODE_ENV === "development" && { stack: errorStack })
      },
      { status: 500 }
    );
  }
}
