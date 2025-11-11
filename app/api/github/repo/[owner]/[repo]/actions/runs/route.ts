import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GitHubClient } from "@/lib/github/github-client";

/**
 * GET /api/github/repo/[owner]/[repo]/actions/runs
 * List repository workflow runs
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
    const actor = searchParams.get("actor") || undefined;
    const branch = searchParams.get("branch") || undefined;
    const event = searchParams.get("event") || undefined;
    const status = searchParams.get("status") as any || undefined;
    const perPage = parseInt(searchParams.get("per_page") || "30", 10);
    const page = parseInt(searchParams.get("page") || "1", 10);

    const client = new GitHubClient(userId);
    await client.initialize();

    const result = await client.listWorkflowRuns(owner, repo, {
      actor,
      branch,
      event,
      status,
      per_page: perPage,
      page,
    });

    // Transform the response to match what the component expects
    const workflows = result.workflow_runs.map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
      created_at: run.created_at,
      updated_at: run.updated_at,
      head_branch: run.head_branch,
      event: run.event,
    }));

    return NextResponse.json({ workflows });
  } catch (error) {
    console.error("Error fetching workflow runs:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const status = errorMessage.includes("not found") || errorMessage.includes("Not Found") ? 404 : 500;
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
}

