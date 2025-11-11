import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getGmailClient } from "@/lib/email/gmail-client";

/**
 * POST /api/email/send
 * Send a new email
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { to, subject, body: emailBody, cc, bcc, isHtml } = body;

    if (!to || !emailBody) {
      return NextResponse.json(
        { error: "to and body are required" },
        { status: 400 }
      );
    }

    // Generate a default subject if not provided
    // Extract first few words from email body as subject
    let finalSubject = subject;
    if (!finalSubject || finalSubject.trim() === "") {
      const bodyText = typeof emailBody === "string" 
        ? emailBody.replace(/<[^>]*>/g, "").trim() // Strip HTML tags
        : String(emailBody).trim();
      const firstWords = bodyText.split(/\s+/).slice(0, 6).join(" ");
      finalSubject = firstWords.length > 50 
        ? firstWords.substring(0, 47) + "..." 
        : firstWords || "(No Subject)";
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

    // Get user's email address for From header
    const userEmail = account.email;

    // Normalize recipients to arrays
    const toArray = Array.isArray(to) ? to : [to];
    const ccArray = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
    const bccArray = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];

    // Build email message in RFC 2822 format
    const emailLines = [
      `From: ${userEmail}`,
      `To: ${toArray.join(", ")}`,
    ];

    if (ccArray.length > 0) {
      emailLines.push(`Cc: ${ccArray.join(", ")}`);
    }

    if (bccArray.length > 0) {
      emailLines.push(`Bcc: ${bccArray.join(", ")}`);
    }

    emailLines.push(`Subject: ${finalSubject}`);

    // Set content type
    if (isHtml) {
      emailLines.push("Content-Type: text/html; charset=utf-8");
    } else {
      emailLines.push("Content-Type: text/plain; charset=utf-8");
    }

    emailLines.push(""); // Empty line before body
    emailLines.push(emailBody);

    const email = emailLines.join("\r\n");

    // Encode message in base64url format
    const encodedMessage = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send email
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    return NextResponse.json({
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

