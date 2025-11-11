import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getGmailClient } from "@/lib/email/gmail-client";
import { parseEmail } from "@/lib/email/email-parser";

/**
 * GET /api/email/[id]
 * Get full email details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
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

    // Handle params as Promise (Next.js 15+) or object (Next.js 14)
    const resolvedParams = params instanceof Promise ? await params : params;
    const emailId = resolvedParams.id;

    console.log("[Email API] Fetching email:", { emailId, params });

    if (!emailId || emailId === "undefined" || emailId === "null") {
      console.error("[Email API] Invalid email ID:", emailId);
      return NextResponse.json(
        { error: "Email ID is required" },
        { status: 400 }
      );
    }

    // Get Gmail client
    const gmail = await getGmailClient(account);

    // Fetch full message
    try {
      const messageResponse = await gmail.users.messages.get({
        userId: "me",
        id: emailId,
        format: "raw",
      });

      const message = messageResponse.data;

      if (!message || !message.raw) {
        console.error("[Email API] Invalid message response:", message);
        return NextResponse.json(
          { error: "Invalid message data received from Gmail" },
          { status: 500 }
        );
      }

      // Decode raw email
      const rawEmail = Buffer.from(message.raw, "base64").toString("utf-8");

      // Parse email
      const parsed = await parseEmail(rawEmail);

      // Get metadata
      const headers = message.payload?.headers || [];
      const fromHeader = headers.find((h) => h.name === "From");
      const toHeader = headers.find((h) => h.name === "To");
      const ccHeader = headers.find((h) => h.name === "Cc");
      const bccHeader = headers.find((h) => h.name === "Bcc");
      const subjectHeader = headers.find((h) => h.name === "Subject");
      const dateHeader = headers.find((h) => h.name === "Date");

      return NextResponse.json({
        id: message.id,
        threadId: message.threadId,
        from: parsed.from,
        to: parsed.to,
        cc: parsed.cc,
        bcc: parsed.bcc,
        subject: parsed.subject,
        date: parsed.date,
        html: parsed.html,
        text: parsed.text,
        attachments: parsed.attachments?.map((att) => ({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          contentId: att.contentId,
          // Don't send content in list - fetch separately if needed
        })),
        snippet: message.snippet || "",
        unread: !message.labelIds?.includes("READ"),
        labels: message.labelIds || [],
      });
    } catch (gmailError: any) {
      console.error("[Email API] Gmail API error:", {
        error: gmailError,
        message: gmailError?.message,
        code: gmailError?.code,
        status: gmailError?.status,
        emailId,
      });
      
      if (gmailError?.message?.includes("Missing required parameters")) {
        return NextResponse.json(
          { error: `Invalid email ID: ${emailId}` },
          { status: 400 }
        );
      }
      
      throw gmailError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    console.error("[Email API] Error fetching email:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

