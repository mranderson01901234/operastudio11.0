import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/email/gmail/connect
 * Initiate Gmail OAuth flow
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString("hex");

    // Store state temporarily (you could use Redis or session storage)
    // For now, we'll include it in the redirect URL and verify in callback
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/email/gmail/callback`;

    const params = new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify",
      access_type: "offline", // Critical for refresh_token
      prompt: "consent", // Force consent screen to get refresh_token
      state: state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    return NextResponse.json({ authUrl, state });
  } catch (error) {
    console.error("Error initiating Gmail OAuth:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

