import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GitHubClient } from "@/lib/github/github-client";

/**
 * POST /api/github/repo/[owner]/[repo]/file
 * Create or update file content
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> | { owner: string; repo: string } }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Handle params as Promise (Next.js 15+) or object (Next.js 14)
    const resolvedParams = params instanceof Promise ? await params : params;

    const client = new GitHubClient(userId);
    await client.initialize();

    // Decode URL parameters (handle double-encoding for repo names with dots)
    const owner = decodeURIComponent(resolvedParams.owner);
    let repo = decodeURIComponent(resolvedParams.repo);
    // Try double-decoding in case it was double-encoded
    if (repo.includes('%')) {
      try {
        const doubleDecoded = decodeURIComponent(repo);
        if (doubleDecoded !== repo) {
          repo = doubleDecoded;
        }
      } catch {
        // If double-decoding fails, use the single-decoded value
      }
    }

    const body = await request.json();
    let { path, content, message, branch, sha } = body;

    if (!path || content === undefined) {
      return NextResponse.json(
        { error: "Path and content are required" },
        { status: 400 }
      );
    }

    // If sha is not provided, try to fetch it from the existing file
    // This is required for updating files in GitHub
    if (!sha) {
      try {
        const existingFile = await client.getFile(owner, repo, path, branch);
        sha = existingFile.sha;
      } catch (error) {
        // File doesn't exist yet, this is fine - we'll create it
        // Only throw if it's not a "not found" error
        const errorMessage = error instanceof Error ? error.message : "";
        if (!errorMessage.includes("Not Found") && !errorMessage.includes("404")) {
          throw error;
        }
      }
    }

    const result = await client.createOrUpdateFile(
      owner,
      repo,
      path,
      content,
      message || `Update ${path}`,
      branch,
      sha
    );

    // Invalidate file cache after successful write
    // Note: This is a hint for the frontend - actual cache invalidation happens client-side
    return NextResponse.json({
      ...result,
      _cacheInvalidate: {
        owner,
        repo,
        path,
      },
    });
  } catch (error) {
    console.error("Error writing file:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/github/repo/[owner]/[repo]/file
 * Get file content
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> | { owner: string; repo: string } }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Handle params as Promise (Next.js 15+) or object (Next.js 14)
    const resolvedParams = params instanceof Promise ? await params : params;

    const client = new GitHubClient(userId);
    await client.initialize();

    // Decode URL parameters (handle double-encoding for repo names with dots)
    const owner = decodeURIComponent(resolvedParams.owner);
    let repo = decodeURIComponent(resolvedParams.repo);
    // Try double-decoding in case it was double-encoded (check if it still contains encoded characters)
    if (repo.includes('%')) {
      try {
        const doubleDecoded = decodeURIComponent(repo);
        // Only use double-decoded if it's different (meaning it was actually double-encoded)
        if (doubleDecoded !== repo) {
          repo = doubleDecoded;
        }
      } catch {
        // If double-decoding fails, use the single-decoded value
      }
    }

    const { searchParams } = request.nextUrl;
    const path = searchParams.get("path");
    const ref = searchParams.get("ref") || undefined;

    if (!path) {
      return NextResponse.json(
        { error: "Path parameter is required" },
        { status: 400 }
      );
    }

    const file = await client.getFile(owner, repo, path, ref);

    return NextResponse.json(file);
  } catch (error) {
    console.error("Error fetching file:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

