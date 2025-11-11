/**
 * Email tool definitions for Gemini function calling.
 * These tools allow the LLM to interact with Gmail via the email API.
 */

import type { ToolDefinition } from "./tool-definitions";

/**
 * Email tools available when a Gmail account is connected.
 * These tools are only available when an active email account exists.
 */
export const EMAIL_TOOLS: ToolDefinition[] = [
  {
    name: "email_list",
    description: "List emails from Gmail inbox, sent, or drafts folder. Use this to see recent emails, search for specific emails, or browse email folders. Supports Gmail search syntax for filtering (e.g., 'from:example@gmail.com', 'subject:meeting', 'has:attachment', 'is:unread'). IMPORTANT: When presenting email lists to the user, be concise. Simply list the emails with their key details (sender, subject, unread status) without verbose explanations. The user can see the full email list in the sidebar.",
    parameters: {
      type: "object",
      properties: {
        folder: {
          type: "string",
          description: "Email folder: 'inbox', 'sent', or 'drafts' (default: 'inbox')"
        },
        query: {
          type: "string",
          description: "Gmail search query for filtering emails. Examples: 'from:example@gmail.com', 'subject:meeting', 'has:attachment', 'is:unread', 'after:2024/1/1', 'label:important'. Leave empty to list all emails in folder."
        },
        maxResults: {
          type: "number",
          description: "Maximum number of emails to return (default: 50, max: 500)"
        },
        pageToken: {
          type: "string",
          description: "Token for pagination (from previous email_list response's nextPageToken field)"
        }
      },
      required: []
    }
  },
  {
    name: "email_get",
    description: "Get full email details including body content and attachments metadata. Use this to read the complete content of an email after listing emails with email_list. Returns HTML and plain text versions of the email body, plus attachment information.",
    parameters: {
      type: "object",
      properties: {
        emailId: {
          type: "string",
          description: "Gmail message ID (from email_list response)"
        }
      },
      required: ["emailId"]
    }
  },
  {
    name: "email_send",
    description: "Send a new email. USE THIS TOOL ONCE when the user asks you to send, compose, or write an email. CRITICAL: Only call this tool ONCE per user request - do not send multiple emails. If the user doesn't specify a subject, generate a brief, appropriate subject based on the email content. The email will be sent from the user's connected Gmail account. Supports plain text and HTML email bodies.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address(es). For multiple recipients, use a comma-separated string or array: 'user1@example.com,user2@example.com' or ['user1@example.com', 'user2@example.com']"
        },
        subject: {
          type: "string",
          description: "Email subject line. If the user doesn't provide a subject, generate a brief, appropriate subject based on the email body content (e.g., 'Thank You', 'Follow-up', 'Quick Update'). Default: '(No Subject)' if not provided."
        },
        body: {
          type: "string",
          description: "Email body content (plain text or HTML depending on isHtml parameter)"
        },
        cc: {
          type: "string",
          description: "CC recipient email address(es). Optional. Use comma-separated string or array for multiple recipients."
        },
        bcc: {
          type: "string",
          description: "BCC recipient email address(es). Optional. Use comma-separated string or array for multiple recipients."
        },
        isHtml: {
          type: "boolean",
          description: "Whether the email body is HTML (default: false for plain text)"
        }
      },
      required: ["to", "body"]
    }
  },
  {
    name: "email_reply",
    description: "Reply to an existing email. USE THIS TOOL when the user asks you to reply, respond, or answer an email. Automatically sets proper reply headers (In-Reply-To, References) and subject line (adds 'Re: ' prefix if needed).",
    parameters: {
      type: "object",
      properties: {
        emailId: {
          type: "string",
          description: "Gmail message ID of the email to reply to (from email_list or email_get response)"
        },
        message: {
          type: "string",
          description: "Reply message body (plain text)"
        },
        threadId: {
          type: "string",
          description: "Thread ID (optional, auto-detected from email if not provided)"
        }
      },
      required: ["emailId", "message"]
    }
  },
  {
    name: "email_archive",
    description: "Archive an email (remove from inbox). USE THIS TOOL when the user asks to archive, file away, or remove an email from inbox. The email will remain accessible in 'All Mail' but will be removed from the inbox.",
    parameters: {
      type: "object",
      properties: {
        emailId: {
          type: "string",
          description: "Gmail message ID of the email to archive"
        }
      },
      required: ["emailId"]
    }
  },
  {
    name: "email_delete",
    description: "Delete an email (move to trash). USE THIS TOOL when the user asks to delete, remove, or trash an email. CRITICAL: This permanently moves the email to trash - use carefully.",
    parameters: {
      type: "object",
      properties: {
        emailId: {
          type: "string",
          description: "Gmail message ID of the email to delete"
        }
      },
      required: ["emailId"]
    }
  },
  {
    name: "email_mark_read",
    description: "Mark an email as read or unread. USE THIS TOOL when the user asks to mark emails as read/unread, or to mark emails as new/unread.",
    parameters: {
      type: "object",
      properties: {
        emailId: {
          type: "string",
          description: "Gmail message ID of the email to mark"
        },
        read: {
          type: "boolean",
          description: "true to mark as read, false to mark as unread"
        }
      },
      required: ["emailId", "read"]
    }
  }
];

