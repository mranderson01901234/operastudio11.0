import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/utils/token-encryption";

/**
 * GET /api/email/gmail/callback
 * Handle Gmail OAuth callback
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/email?error=unauthorized`
      );
    }

    const { code, state, error } = Object.fromEntries(
      request.nextUrl.searchParams
    );

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/email?error=${error}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/email?error=no_code`
      );
    }

    // Exchange code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/email/gmail/callback`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GMAIL_CLIENT_ID!,
        client_secret: process.env.GMAIL_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/email?error=token_exchange_failed`
      );
    }

    const tokens = await tokenResponse.json();

    // Validate tokens were received
    if (!tokens.access_token) {
      console.error("No access token in response:", tokens);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/email?error=no_access_token`
      );
    }

    // Get user's email address using Gmail API profile endpoint
    // Alternative: use oauth2/v2/userinfo or gmail/v1/users/me/profile
    let userInfo;
    try {
      // Try Gmail API profile endpoint first (more reliable)
      const profileResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );

      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        userInfo = {
          email: profile.emailAddress,
        };
      } else {
        // Fallback to OAuth2 userinfo endpoint
        const userInfoResponse = await fetch(
          "https://www.googleapis.com/oauth2/v2/userinfo",
          {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          }
        );

        if (!userInfoResponse.ok) {
          const errorText = await userInfoResponse.text();
          console.error("Failed to fetch user info:", {
            status: userInfoResponse.status,
            statusText: userInfoResponse.statusText,
            error: errorText,
            hasAccessToken: !!tokens.access_token,
            tokenLength: tokens.access_token?.length,
          });
          return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/email?error=user_info_failed&details=${encodeURIComponent(errorText)}`
          );
        }

        userInfo = await userInfoResponse.json();
      }
    } catch (fetchError) {
      console.error("Error fetching user info:", fetchError);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/email?error=user_info_fetch_error`
      );
    }

    if (!userInfo || !userInfo.email) {
      console.error("No email in userInfo:", userInfo);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/email?error=no_email_in_response`
      );
    }

    // Check if account already exists
    const existingAccount = await prisma.emailAccount.findUnique({
      where: {
        userId_provider_email: {
          userId,
          provider: "GMAIL",
          email: userInfo.email,
        },
      },
    });

    if (existingAccount) {
      // Update existing account
      await prisma.emailAccount.update({
        where: { id: existingAccount.id },
        data: {
          accessTokenEnc: encryptToken(tokens.access_token),
          refreshTokenEnc: encryptToken(tokens.refresh_token),
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scope: tokens.scope || "",
          status: "ACTIVE",
          lastSyncedAt: new Date(),
        },
      });
    } else {
      // Create new account
      await prisma.emailAccount.create({
        data: {
          userId,
          provider: "GMAIL",
          email: userInfo.email,
          accessTokenEnc: encryptToken(tokens.access_token),
          refreshTokenEnc: encryptToken(tokens.refresh_token),
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scope: tokens.scope || "",
          status: "ACTIVE",
        },
      });
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/email?success=true`
    );
  } catch (error) {
    console.error("Error in Gmail callback:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/email?error=internal_error`
    );
  }
}

