import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { decryptToken, encryptToken } from "@/lib/utils/token-encryption";

export interface EmailAccount {
  id: string;
  userId: string;
  provider: string;
  email: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: Date | null;
  scope: string;
  status: string;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshTokenEnc: string
): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const refreshToken = decryptToken(refreshTokenEnc);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Get valid access token for email account (refreshes if needed)
 */
export async function getValidAccessToken(
  account: EmailAccount
): Promise<string> {
  // Check if token is expired (with 5min buffer)
  const now = Date.now();
  const expiresAt = account.expiresAt?.getTime() || 0;

  if (expiresAt - now < 5 * 60 * 1000) {
    // Token expired or expiring soon - refresh it
    const { accessToken, expiresAt: newExpiresAt } = await refreshAccessToken(
      account.refreshTokenEnc
    );

    // Update DB with new token
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: encryptToken(accessToken),
        expiresAt: newExpiresAt,
        lastSyncedAt: new Date(),
      },
    });

    return accessToken;
  }

  // Token still valid
  return decryptToken(account.accessTokenEnc);
}

/**
 * Get Gmail API client with valid access token
 */
export async function getGmailClient(account: EmailAccount) {
  const accessToken = await getValidAccessToken(account);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

