import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getGmailClient } from "@/lib/email/gmail-client";

/**
 * POST /api/email/mark-read
 * Mark an email as read or unread
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { emailId, read } = body;

    if (!emailId || typeof read !== "boolean") {
      return NextResponse.json(
        { error: "emailId and read (boolean) are required" },
        { status: 400 }
      );
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

    // Get Gmail client
    const gmail = await getGmailClient(account);

    // Modify email labels
    if (read) {
      // Mark as read: remove UNREAD label (or add READ label)
      await gmail.users.messages.modify({
        userId: "me",
        id: emailId,
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
    } else {
      // Mark as unread: add UNREAD label
      await gmail.users.messages.modify({
        userId: "me",
        id: emailId,
        requestBody: {
          addLabelIds: ["UNREAD"],
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking email as read/unread:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

