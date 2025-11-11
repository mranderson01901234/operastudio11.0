import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";

/**
 * GET /api/github/connect
 * Initiate GitHub OAuth flow
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if GitHub OAuth credentials are configured
    if (!process.env.GITHUB_CLIENT_ID) {
      console.error("GITHUB_CLIENT_ID environment variable is not set");
      return NextResponse.json(
        { error: "GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID environment variable." },
        { status: 500 }
      );
    }

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString("hex");

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/github/callback`;

    // GitHub OAuth scopes
    // repo: Full control of private repositories
    // read:org: Read org and team membership
    // workflow: Update GitHub Action workflows
    const scopes = [
      "repo",
      "read:org",
      "workflow",
    ].join(" ");

    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: scopes,
      state: state,
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params}`;

    console.log(`[GitHub Connect] Generated OAuth URL for user ${userId}`);

    return NextResponse.json({ authUrl, state });
  } catch (error) {
    console.error("Error initiating GitHub OAuth:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

