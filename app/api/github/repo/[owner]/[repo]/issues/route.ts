import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GitHubClient } from "@/lib/github/github-client";

/**
 * POST /api/github/repo/[owner]/[repo]/issues
 * Create a new issue
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

    const body = await request.json();
    const { title, body: issueBody, labels } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const client = new GitHubClient(userId);
    await client.initialize();

    const issue = await client.createIssue(owner, repo, title, issueBody, labels);

    return NextResponse.json(issue);
  } catch (error) {
    console.error("Error creating issue:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const status = errorMessage.includes("not found") || errorMessage.includes("Not Found") ? 404 : 500;
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
}

/**
 * GET /api/github/repo/[owner]/[repo]/issues
 * List repository issues
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
    const state = (searchParams.get("state") || "open") as "open" | "closed" | "all";
    const labels = searchParams.get("labels") || undefined;
    const sort = (searchParams.get("sort") || "created") as "created" | "updated" | "comments";
    const direction = (searchParams.get("direction") || "desc") as "asc" | "desc";
    const perPage = parseInt(searchParams.get("per_page") || "30", 10);
    const page = parseInt(searchParams.get("page") || "1", 10);

    const client = new GitHubClient(userId);
    await client.initialize();

    const issues = await client.listIssues(owner, repo, {
      state,
      labels,
      sort,
      direction,
      per_page: perPage,
      page,
    });

    return NextResponse.json({ issues });
  } catch (error) {
    console.error("Error fetching issues:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const status = errorMessage.includes("not found") || errorMessage.includes("Not Found") ? 404 : 500;
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
}

