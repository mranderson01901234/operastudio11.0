import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GitHubClient } from "@/lib/github/github-client";

/**
 * GET /api/github/repo/[owner]/[repo]/commits
 * List repository commits
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

    // Decode URL parameters
    const owner = decodeURIComponent(resolvedParams.owner);
    let repo = decodeURIComponent(resolvedParams.repo);
    if (repo.includes('%')) {
      try {
        const doubleDecoded = decodeURIComponent(repo);
        if (doubleDecoded !== repo) {
          repo = doubleDecoded;
        }
      } catch {
        // Use single-decoded value
      }
    }

    const { searchParams } = request.nextUrl;
    const sha = searchParams.get("sha") || undefined;
    const path = searchParams.get("path") || undefined;
    const author = searchParams.get("author") || undefined;
    const since = searchParams.get("since") || undefined;
    const until = searchParams.get("until") || undefined;
    const perPage = parseInt(searchParams.get("per_page") || "30", 10);
    const page = parseInt(searchParams.get("page") || "1", 10);

    const client = new GitHubClient(userId);
    await client.initialize();

    const commits = await client.listCommits(owner, repo, {
      sha,
      path,
      author,
      since,
      until,
      per_page: perPage,
      page,
    });

    return NextResponse.json({ commits });
  } catch (error) {
    console.error("Error fetching commits:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const status = errorMessage.includes("not found") || errorMessage.includes("Not Found") ? 404 : 500;
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
}

