import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ChildProcess } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { createReadStream } from "fs";

type SecurityMode = "SAFE" | "BALANCED" | "UNRESTRICTED";

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

// File size thresholds
const MAX_MEMORY_SIZE = 1024 * 1024; // 1MB - load into memory
const MAX_STREAMING_SIZE = 10 * 1024 * 1024; // 10MB - max streamable size

/**
 * Read file contents directly (bypassing MCP for now)
 */
async function readFile(
  filePath: string,
  security: SecurityPolicy
): Promise<{
  content?: string;
  size: number;
  type: string;
  shouldStream: boolean;
  resolvedPath: string;
}> {
  // Check security
  const pathCheck = security.isPathAllowed(filePath);
  if (!pathCheck.allowed) {
    throw new Error(`PERMISSION_DENIED: ${pathCheck.reason}`);
  }

  // Resolve ~ to home directory
  let resolvedPath = filePath;
  if (filePath === "~" || filePath.startsWith("~/")) {
    const homeDir = os.homedir();
    resolvedPath = filePath === "~" ? homeDir : path.join(homeDir, filePath.slice(2));
  }
  resolvedPath = path.resolve(resolvedPath);

  // Check if file exists
  try {
    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      throw new Error(`NOT_FOUND: Path is not a file: ${filePath}`);
    }

    // Check if file is too large
    if (stats.size > MAX_STREAMING_SIZE) {
      throw new Error(`FILE_TOO_LARGE: File size ${stats.size} bytes exceeds maximum of ${MAX_STREAMING_SIZE} bytes`);
    }

    // For files larger than 1MB, signal that streaming should be used
    if (stats.size > MAX_MEMORY_SIZE) {
      return {
        size: stats.size,
        type: "text",
        shouldStream: true,
        resolvedPath,
      };
    }

    // For small files, read into memory
    const content = await fs.readFile(resolvedPath, "utf-8");
    return {
      content,
      size: stats.size,
      type: "text",
      shouldStream: false,
      resolvedPath,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`NOT_FOUND: File not found: ${filePath}`);
    }
    throw error;
  }
}

/**
 * GET /api/filesystem/read
 * 
 * Reads file contents using file system directly
 * 
 * Query params: path
 * Output: {content: string, size: number, type: string}
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
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json(
        { error: "Path parameter is required" },
        { status: 400 }
      );
    }

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
    const security = new SecurityPolicy(mode);

    // Read file (or get file info if streaming)
    const result = await readFile(filePath, security);

    // If file should be streamed, return a streaming response
    if (result.shouldStream) {
      const stream = createReadStream(result.resolvedPath, {
        encoding: 'utf-8',
        highWaterMark: 64 * 1024 // 64KB chunks
      });

      return new Response(stream as any, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': String(result.size),
          'X-File-Streamed': 'true',
        },
      });
    }

    // For small files, return JSON response
    return NextResponse.json({
      content: result.content,
      size: result.size,
      type: result.type,
    });
  } catch (error) {
    console.error("Error reading file:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Check for specific error types
    if (errorMessage.includes("PERMISSION_DENIED")) {
      return NextResponse.json(
        { error: "Permission denied", details: errorMessage },
        { status: 403 }
      );
    }
    if (errorMessage.includes("NOT_FOUND")) {
      return NextResponse.json(
        { error: "File not found", details: errorMessage },
        { status: 404 }
      );
    }
    if (errorMessage.includes("FILE_TOO_LARGE")) {
      return NextResponse.json(
        { error: "File too large", details: errorMessage },
        { status: 413 }
      );
    }

    return NextResponse.json(
      { error: "Failed to read file", details: errorMessage },
      { status: 500 }
    );
  }
}

