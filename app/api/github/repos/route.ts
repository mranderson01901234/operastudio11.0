import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GitHubClient } from "@/lib/github/github-client";

/**
 * GET /api/github/repos
 * List user's GitHub repositories
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = new GitHubClient(userId);
    await client.initialize();

    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type") as "all" | "owner" | "member" | undefined;
    const sort = searchParams.get("sort") as "created" | "updated" | "pushed" | "full_name" | undefined;
    const direction = searchParams.get("direction") as "asc" | "desc" | undefined;
    const perPage = searchParams.get("per_page") ? parseInt(searchParams.get("per_page")!) : undefined;
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!) : undefined;

    const repositories = await client.listRepos({
      type,
      sort,
      direction,
      per_page: perPage,
      page,
    });

    return NextResponse.json({ repositories });
  } catch (error) {
    console.error("Error listing repositories:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

