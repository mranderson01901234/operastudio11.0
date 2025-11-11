import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getGmailClient } from "@/lib/email/gmail-client";

/**
 * GET /api/email/list
 * List emails from Gmail
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's email account
    const account = await prisma.emailAccount.findFirst({
      where: {
        userId,
        status: "ACTIVE",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "No email account found" },
        { status: 404 }
      );
    }

    const { searchParams } = request.nextUrl;
    const maxResults = parseInt(searchParams.get("maxResults") || "50");
    const folder = searchParams.get("folder") || "inbox";
    const q = searchParams.get("q") || "";
    const pageToken = searchParams.get("pageToken") || undefined;

    // Build Gmail query
    let gmailQuery = "";
    if (folder === "inbox") {
      gmailQuery = "in:inbox";
    } else if (folder === "sent") {
      gmailQuery = "in:sent";
    } else if (folder === "drafts") {
      gmailQuery = "in:drafts";
    }

    if (q) {
      gmailQuery += ` ${q}`;
    }

    // Get Gmail client
    const gmail = await getGmailClient(account);

    // List messages
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: gmailQuery.trim() || undefined,
      pageToken: pageToken,
    });

    const messages = listResponse.data.messages || [];

    // Helper function to parse email message
    const parseMessage = (message: any) => {
      const headers = message.payload?.headers || [];

      const fromHeader = headers.find((h: any) => h.name === "From");
      const toHeader = headers.find((h: any) => h.name === "To");
      const subjectHeader = headers.find((h: any) => h.name === "Subject");
      const dateHeader = headers.find((h: any) => h.name === "Date");

      // Parse From header
      const fromMatch = fromHeader?.value?.match(/^(.+?)\s*<(.+?)>$|^(.+?)$/);
      const from = fromMatch
        ? {
            name: fromMatch[1]?.trim() || fromMatch[3]?.trim() || "",
            email: fromMatch[2] || fromMatch[3] || "",
          }
        : { name: "", email: fromHeader?.value || "" };

      // Parse To header
      const toEmails = toHeader?.value
        ?.split(",")
        .map((addr: string) => {
          const match = addr.trim().match(/^(.+?)\s*<(.+?)>$|^(.+?)$/);
          return match
            ? {
                name: match[1]?.trim() || match[3]?.trim() || "",
                email: match[2] || match[3] || "",
              }
            : { name: "", email: addr.trim() };
        }) || [];

      return {
        id: message.id,
        threadId: message.threadId,
        from,
        to: toEmails,
        subject: subjectHeader?.value || "(No Subject)",
        date: dateHeader?.value
          ? new Date(dateHeader.value)
          : new Date(message.internalDate || Date.now()),
        snippet: message.snippet || "",
        unread: !message.labelIds?.includes("READ"),
        labels: message.labelIds || [],
      };
    };

    // Fetch message details using batch requests (more efficient than N+1 queries)
    // Process in chunks of 50 to avoid batch API limits
    const BATCH_SIZE = 50;
    const emails = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const chunk = messages.slice(i, Math.min(i + BATCH_SIZE, maxResults));

      // Fetch all messages in this chunk in parallel
      const chunkPromises = chunk.map(async (msg) => {
        if (!msg.id) {
          console.error("[Email List] Message missing ID in list:", msg);
          return null;
        }

        try {
          const messageResponse = await gmail.users.messages.get({
            userId: "me",
            id: msg.id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"],
          });

          if (!messageResponse.data.id) {
            console.error("[Email List] Message missing ID:", messageResponse.data);
            return null;
          }

          return parseMessage(messageResponse.data);
        } catch (error) {
          console.error(`[Email List] Error fetching message ${msg.id}:`, error);
          return null;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      emails.push(...chunkResults.filter((email): email is NonNullable<typeof email> => email !== null));
    }

    return NextResponse.json({ 
      emails,
      nextPageToken: listResponse.data.nextPageToken || null,
    });
  } catch (error) {
    console.error("Error listing emails:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

