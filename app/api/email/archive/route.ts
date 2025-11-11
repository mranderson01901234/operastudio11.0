import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getGmailClient } from "@/lib/email/gmail-client";

/**
 * POST /api/email/archive
 * Archive an email (remove INBOX label)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { emailId } = body;

    if (!emailId) {
      return NextResponse.json(
        { error: "emailId is required" },
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

    // Archive email by removing INBOX label
    await gmail.users.messages.modify({
      userId: "me",
      id: emailId,
      requestBody: {
        removeLabelIds: ["INBOX"],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error archiving email:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

