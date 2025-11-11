import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";

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

  isWriteAllowed(filePath: string): { allowed: boolean; reason?: string } {
    return this.isPathAllowed(filePath);
  }
}

/**
 * Write file contents directly
 */
async function writeFile(
  filePath: string,
  content: string,
  create: boolean,
  security: SecurityPolicy
): Promise<{ success: boolean; path: string }> {
  // Check security
  const writeCheck = security.isWriteAllowed(filePath);
  if (!writeCheck.allowed) {
    throw new Error(`PERMISSION_DENIED: ${writeCheck.reason}`);
  }

  // Resolve ~ to home directory
  let resolvedPath = filePath;
  if (filePath === "~" || filePath.startsWith("~/")) {
    const homeDir = os.homedir();
    resolvedPath = filePath === "~" ? homeDir : path.join(homeDir, filePath.slice(2));
  }
  resolvedPath = path.resolve(resolvedPath);

  // Check if file exists (if create is false)
  if (!create) {
    try {
      await fs.access(resolvedPath);
    } catch {
      throw new Error(`NOT_FOUND: File not found: ${filePath}`);
    }
  } else {
    // Ensure directory exists
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });
  }

  // Write file
  await fs.writeFile(resolvedPath, content, "utf-8");

  return { success: true, path: resolvedPath };
}

/**
 * POST /api/filesystem/save
 * 
 * Saves file contents using file system directly
 * 
 * Body: {path: string, content: string}
 * Output: {success: boolean, path: string, size: number}
 * Auth: Clerk session required
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { path: filePath, content } = body;

    if (!filePath || content === undefined) {
      return NextResponse.json(
        { error: "Path and content are required" },
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

    // Write file
    const result = await writeFile(filePath, content, true, security);

    return NextResponse.json({
      success: true,
      path: filePath,
      size: new TextEncoder().encode(content).length,
    });
  } catch (error) {
    console.error("Error saving file:", error);
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

    return NextResponse.json(
      { error: "Failed to save file", details: errorMessage },
      { status: 500 }
    );
  }
}

