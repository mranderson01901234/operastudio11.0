import { simpleParser, ParsedMail } from "mailparser";

export interface ParsedEmail {
  id: string;
  threadId: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc?: { name: string; email: string }[];
  bcc?: { name: string; email: string }[];
  subject: string;
  date: Date;
  html?: string;
  text?: string;
  attachments?: Attachment[];
  headers: Record<string, string | string[]>;
  snippet?: string;
  unread?: boolean;
  labels?: string[];
}

export interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  content?: Buffer;
}

/**
 * Parse raw email string from Gmail API
 */
export async function parseEmail(rawEmail: string): Promise<Omit<ParsedEmail, "id" | "threadId" | "snippet" | "unread" | "labels">> {
  const parsed = await simpleParser(rawEmail);

  const from = parsed.from
    ? {
        name: parsed.from.name || "",
        email: parsed.from.text || "",
      }
    : { name: "", email: "" };

  const to = Array.isArray(parsed.to)
    ? parsed.to.map((addr) => ({
        name: addr.name || "",
        email: addr.text || "",
      }))
    : parsed.to
    ? [{ name: parsed.to.name || "", email: parsed.to.text || "" }]
    : [];

  const cc = parsed.cc
    ? Array.isArray(parsed.cc)
      ? parsed.cc.map((addr) => ({
          name: addr.name || "",
          email: addr.text || "",
        }))
      : [{ name: parsed.cc.name || "", email: parsed.cc.text || "" }]
    : undefined;

  const bcc = parsed.bcc
    ? Array.isArray(parsed.bcc)
      ? parsed.bcc.map((addr) => ({
          name: addr.name || "",
          email: addr.text || "",
        }))
      : [{ name: parsed.bcc.name || "", email: parsed.bcc.text || "" }]
    : undefined;

  const attachments: Attachment[] = parsed.attachments.map((att) => ({
    filename: att.filename || "attachment",
    contentType: att.contentType || "application/octet-stream",
    size: att.size || 0,
    contentId: att.contentId,
    content: att.content as Buffer,
  }));

  return {
    from,
    to,
    cc,
    bcc,
    subject: parsed.subject || "(No Subject)",
    date: parsed.date || new Date(),
    html: parsed.html as string | undefined,
    text: parsed.text || undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    headers: parsed.headers as Record<string, string | string[]>,
  };
}

