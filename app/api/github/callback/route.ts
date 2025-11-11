import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/utils/token-encryption";

/**
 * GET /api/github/callback
 * Handle GitHub OAuth callback
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?error=unauthorized`
      );
    }

    const { code, state, error } = Object.fromEntries(
      request.nextUrl.searchParams
    );

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?error=${error}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?error=no_code`
      );
    }

    // Exchange code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/github/callback`;

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?error=token_exchange_failed`
      );
    }

    const tokens = await tokenResponse.json();

    // Validate tokens were received
    if (!tokens.access_token) {
      console.error("No access token in response:", tokens);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?error=no_access_token`
      );
    }

    // Get user's GitHub username using GitHub API
    let userInfo;
    try {
      const userInfoResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "OperaStudio/1.0",
        },
      });

      if (!userInfoResponse.ok) {
        const errorText = await userInfoResponse.text();
        console.error("Failed to fetch user info:", {
          status: userInfoResponse.status,
          statusText: userInfoResponse.statusText,
          error: errorText,
        });
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?error=user_info_failed&details=${encodeURIComponent(errorText)}`
        );
      }

      userInfo = await userInfoResponse.json();
    } catch (fetchError) {
      console.error("Error fetching user info:", fetchError);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?error=user_info_fetch_error`
      );
    }

    if (!userInfo || !userInfo.login) {
      console.error("No username in userInfo:", userInfo);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?error=no_username_in_response`
      );
    }

    // Check if account already exists
    const existingAccount = await prisma.gitHubAccount.findUnique({
      where: {
        userId_provider_username: {
          userId,
          provider: "GITHUB",
          username: userInfo.login,
        },
      },
    });

    // GitHub tokens don't expire by default, but we'll set expiresAt to null
    // If refresh_token is provided, we'll store it (though GitHub doesn't always provide one)
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    if (existingAccount) {
      // Update existing account
      await prisma.gitHubAccount.update({
        where: { id: existingAccount.id },
        data: {
          accessTokenEnc: encryptToken(tokens.access_token),
          refreshTokenEnc: tokens.refresh_token
            ? encryptToken(tokens.refresh_token)
            : existingAccount.refreshTokenEnc, // Keep existing if no new refresh token
          expiresAt,
          scope: tokens.scope || "",
          status: "ACTIVE",
          lastSyncedAt: new Date(),
        },
      });
    } else {
      // Create new account
      await prisma.gitHubAccount.create({
        data: {
          userId,
          provider: "GITHUB",
          username: userInfo.login,
          accessTokenEnc: encryptToken(tokens.access_token),
          refreshTokenEnc: tokens.refresh_token
            ? encryptToken(tokens.refresh_token)
            : null,
          expiresAt,
          scope: tokens.scope || "",
          status: "ACTIVE",
        },
      });
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?github_connected=true`
    );
  } catch (error) {
    console.error("Error in GitHub callback:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?error=internal_error`
    );
  }
}

