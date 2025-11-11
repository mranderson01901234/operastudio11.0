import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getGmailClient } from "@/lib/email/gmail-client";

/**
 * POST /api/email/reply
 * Reply to an email
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { emailId, message, threadId } = body;

    if (!emailId || !message) {
      return NextResponse.json(
        { error: "emailId and message are required" },
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

    // Get the original email to extract headers
    const originalMessage = await gmail.users.messages.get({
      userId: "me",
      id: emailId,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "References", "In-Reply-To"],
    });

    const headers = originalMessage.data.payload?.headers || [];
    const fromHeader = headers.find((h) => h.name === "From");
    const toHeader = headers.find((h) => h.name === "To");
    const subjectHeader = headers.find((h) => h.name === "Subject");
    const referencesHeader = headers.find((h) => h.name === "References");
    const inReplyToHeader = headers.find((h) => h.name === "In-Reply-To");
    const messageIdHeader = headers.find((h) => h.name === "Message-ID");

    // Build reply headers
    const replyTo = fromHeader?.value || "";
    const replySubject = subjectHeader?.value?.startsWith("Re: ")
      ? subjectHeader.value
      : `Re: ${subjectHeader?.value || ""}`;

    // Build References header (combine existing references with current message ID)
    const currentMessageId = messageIdHeader?.value || "";
    const existingReferences = referencesHeader?.value || "";
    const references = existingReferences
      ? `${existingReferences} ${currentMessageId}`.trim()
      : currentMessageId;

    // Build email message
    const emailLines = [
      `To: ${replyTo}`,
      `Subject: ${replySubject}`,
      `In-Reply-To: ${currentMessageId}`,
      `References: ${references}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      message,
    ];

    const email = emailLines.join("\r\n");

    // Encode message in base64url format
    const encodedMessage = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send reply
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
        threadId: threadId || originalMessage.data.threadId,
      },
    });

    return NextResponse.json({
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    });
  } catch (error) {
    console.error("Error replying to email:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

