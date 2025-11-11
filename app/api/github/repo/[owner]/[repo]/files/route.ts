import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GitHubClient } from "@/lib/github/github-client";

/**
 * GET /api/github/repo/[owner]/[repo]/files
 * List repository files/directories
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

    console.log(`Fetching repository files: ${owner}/${repo}`);

    const client = new GitHubClient(userId);
    await client.initialize();

    const { searchParams } = request.nextUrl;
    const path = searchParams.get("path") || "";
    const ref = searchParams.get("ref") || undefined;

    const contents = await client.getRepoContents(owner, repo, path, ref);

    // If it's a single file, return it as an array with one item
    // If it's a directory, return the array
    if (Array.isArray(contents)) {
      return NextResponse.json({ files: contents });
    } else {
      // Single file - return as array with one item
      return NextResponse.json({ files: [contents] });
    }
  } catch (error) {
    console.error("Error fetching repository files:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const status = errorMessage.includes("not found") || errorMessage.includes("Not Found") ? 404 : 500;
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
}

