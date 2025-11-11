# Email Feature Implementation Audit

## Executive Summary

The email feature is **partially implemented** with a solid foundation for Gmail integration, but **email tools are NOT yet available to the LLM**. The system has backend APIs and UI components, but lacks the tool definitions and integration needed for LLM function calling.

---

## ✅ Currently Implemented Features

### 1. Database Schema
- **Model**: `EmailAccount` in Prisma schema
- **Fields**: 
  - `id`, `userId`, `provider`, `email`
  - `accessTokenEnc`, `refreshTokenEnc` (encrypted)
  - `expiresAt`, `scope`, `status`, `lastSyncedAt`
- **Status Enum**: `ACTIVE`, `EXPIRED`, `REVOKED`, `ERROR`
- **Security**: Tokens encrypted at rest using AES-256-GCM

### 2. Backend API Routes

#### ✅ Authentication & Account Management
- **`GET /api/email/account`** - Get user's active email account
- **`GET /api/email/gmail/connect`** - Initiate Gmail OAuth flow
- **`GET /api/email/gmail/callback`** - Handle OAuth callback

#### ✅ Email Operations
- **`GET /api/email/list`** - List emails with filtering
  - Supports `folder` parameter: `inbox`, `sent`, `drafts`
  - Supports `q` parameter for Gmail search queries
  - Supports `maxResults` and `pageToken` for pagination
  - Returns: email list with metadata (from, to, subject, date, snippet, unread status)
  
- **`GET /api/email/[id]`** - Get full email details
  - Returns: complete email with HTML/text content, attachments metadata
  - Uses `format: "raw"` to get full email body
  - Parses email using `mailparser` library
  
- **`POST /api/email/reply`** - Reply to an email
  - Parameters: `emailId`, `message`, `threadId` (optional)
  - Builds proper reply headers (In-Reply-To, References)
  - Sends reply via Gmail API
  
- **`POST /api/email/archive`** - Archive an email
  - Removes `INBOX` label from email
  
- **`POST /api/email/delete`** - Delete an email
  - Moves email to trash via Gmail API

### 3. Email Client Library
- **`lib/email/gmail-client.ts`** - Gmail API wrapper
  - Automatic token refresh (refreshes 5 minutes before expiration)
  - OAuth2 client management
  - Error handling

### 4. Email Parsing & Utilities
- **`lib/email/email-parser.ts`** - Parses raw emails using `mailparser`
- **`lib/email/avatar.ts`** - Generates avatars from email addresses
- **`lib/utils/token-encryption.ts`** - AES-256-GCM encryption for OAuth tokens

### 5. UI Components
- **`components/email/email-list.tsx`** - Email list sidebar
- **`components/email/email-viewer.tsx`** - Email viewer with actions
- **`components/email/email-body.tsx`** - Email content renderer (sanitized HTML)
- **`contexts/email-context.tsx`** - Email state management

---

## ❌ Missing: LLM Tool Integration

### Current State
- **File system tools** are integrated via MCP server (`fs_read`, `fs_write`, `fs_list`, `fs_delete`, `cmd_execute`)
- **Email tools are NOT defined** in `lib/chat/tool-definitions.ts`
- **Email tools are NOT exposed** to the LLM via Gemini function calling
- **No email tool handler** exists to execute email operations

### What's Needed

The LLM should be able to use email tools similar to how it uses file system tools. Email operations should be exposed as function calling tools.

---

## 📋 Recommended Email Tools for LLM

Based on the existing API routes, the following tools should be available to the LLM:

### 1. `email_list` ✅ (API exists)
**Purpose**: List emails from Gmail inbox/sent/drafts

**Parameters**:
- `folder` (string, optional): `"inbox"` | `"sent"` | `"drafts"` (default: `"inbox"`)
- `query` (string, optional): Gmail search query (e.g., `"from:example@gmail.com"`, `"subject:meeting"`)
- `maxResults` (number, optional): Maximum number of emails to return (default: 50)
- `pageToken` (string, optional): Token for pagination

**Returns**: Array of email objects with:
- `id`, `threadId`, `from`, `to`, `subject`, `date`, `snippet`, `unread`, `labels`

**Example Usage**:
```typescript
{
  name: "email_list",
  arguments: {
    folder: "inbox",
    query: "from:john@example.com",
    maxResults: 20
  }
}
```

---

### 2. `email_get` ✅ (API exists)
**Purpose**: Get full email details including body and attachments

**Parameters**:
- `emailId` (string, required): Gmail message ID

**Returns**: Full email object with:
- `id`, `threadId`, `from`, `to`, `cc`, `bcc`, `subject`, `date`
- `html`, `text` (email body content)
- `attachments` (array with metadata: filename, contentType, size, contentId)
- `snippet`, `unread`, `labels`

**Example Usage**:
```typescript
{
  name: "email_get",
  arguments: {
    emailId: "18a1b2c3d4e5f6g7"
  }
}
```

---

### 3. `email_send` ❌ (API MISSING - needs implementation)
**Purpose**: Send a new email (not a reply)

**Parameters**:
- `to` (string or array, required): Recipient email address(es)
- `subject` (string, required): Email subject
- `body` (string, required): Email body (plain text or HTML)
- `cc` (string or array, optional): CC recipients
- `bcc` (string or array, optional): BCC recipients
- `isHtml` (boolean, optional): Whether body is HTML (default: false)

**Returns**: 
- `messageId`, `threadId`

**Status**: **NOT IMPLEMENTED** - Need to create `POST /api/email/send/route.ts`

**Example Usage**:
```typescript
{
  name: "email_send",
  arguments: {
    to: "recipient@example.com",
    subject: "Meeting Tomorrow",
    body: "Hi, let's meet at 2pm.",
    cc: ["manager@example.com"]
  }
}
```

---

### 4. `email_reply` ✅ (API exists)
**Purpose**: Reply to an existing email

**Parameters**:
- `emailId` (string, required): ID of email to reply to
- `message` (string, required): Reply message body
- `threadId` (string, optional): Thread ID (auto-detected if not provided)

**Returns**:
- `success`, `messageId`, `threadId`

**Example Usage**:
```typescript
{
  name: "email_reply",
  arguments: {
    emailId: "18a1b2c3d4e5f6g7",
    message: "Thanks for your email. I'll get back to you soon."
  }
}
```

---

### 5. `email_archive` ✅ (API exists)
**Purpose**: Archive an email (remove from inbox)

**Parameters**:
- `emailId` (string, required): ID of email to archive

**Returns**:
- `success: true`

**Example Usage**:
```typescript
{
  name: "email_archive",
  arguments: {
    emailId: "18a1b2c3d4e5f6g7"
  }
}
```

---

### 6. `email_delete` ✅ (API exists)
**Purpose**: Delete an email (move to trash)

**Parameters**:
- `emailId` (string, required): ID of email to delete

**Returns**:
- `success: true`

**Example Usage**:
```typescript
{
  name: "email_delete",
  arguments: {
    emailId: "18a1b2c3d4e5f6g7"
  }
}
```

---

### 7. `email_mark_read` ❌ (API MISSING - needs implementation)
**Purpose**: Mark email as read/unread

**Parameters**:
- `emailId` (string, required): ID of email
- `read` (boolean, required): `true` to mark as read, `false` to mark as unread

**Returns**:
- `success: true`

**Status**: **NOT IMPLEMENTED** - Need to create `POST /api/email/mark-read/route.ts`

**Example Usage**:
```typescript
{
  name: "email_mark_read",
  arguments: {
    emailId: "18a1b2c3d4e5f6g7",
    read: true
  }
}
```

---

### 8. `email_search` ⚠️ (Partially exists via `email_list`)
**Purpose**: Search emails using Gmail search syntax

**Note**: This functionality exists via `email_list` with the `query` parameter. Consider if a separate tool is needed or if `email_list` is sufficient.

**Gmail Search Examples**:
- `"from:example@gmail.com"` - Emails from specific sender
- `"subject:meeting"` - Emails with subject containing "meeting"
- `"has:attachment"` - Emails with attachments
- `"is:unread"` - Unread emails
- `"after:2024/1/1"` - Emails after date
- `"label:important"` - Emails with label

---

## 🔧 Implementation Requirements

### Phase 1: Add Missing API Routes

1. **Create `POST /api/email/send/route.ts`**
   - Accept: `to`, `subject`, `body`, `cc`, `bcc`, `isHtml`
   - Build email message in RFC 2822 format
   - Encode in base64url format
   - Call `gmail.users.messages.send()`
   - Return `messageId` and `threadId`

2. **Create `POST /api/email/mark-read/route.ts`**
   - Accept: `emailId`, `read` (boolean)
   - Use `gmail.users.messages.modify()` with `addLabelIds` or `removeLabelIds` for "READ" label
   - Return success status

### Phase 2: Create Email Tool Definitions

**File**: `lib/chat/email-tool-definitions.ts` (new file)

Create tool definitions following the same pattern as `lib/chat/tool-definitions.ts`:

```typescript
export const EMAIL_TOOLS: ToolDefinition[] = [
  {
    name: "email_list",
    description: "List emails from Gmail inbox, sent, or drafts folder. Use this to see recent emails, search for specific emails, or browse email folders.",
    parameters: {
      type: "object",
      properties: {
        folder: {
          type: "string",
          description: "Email folder: 'inbox', 'sent', or 'drafts' (default: 'inbox')"
        },
        query: {
          type: "string",
          description: "Gmail search query (e.g., 'from:example@gmail.com', 'subject:meeting', 'has:attachment')"
        },
        maxResults: {
          type: "number",
          description: "Maximum number of emails to return (default: 50, max: 500)"
        },
        pageToken: {
          type: "string",
          description: "Token for pagination (from previous email_list response)"
        }
      },
      required: []
    }
  },
  // ... other tools
];
```

### Phase 3: Integrate Email Tools with Chat API

**File**: `app/api/chat/route.ts`

1. **Check for active email account** (similar to MCP session check):
   ```typescript
   const hasEmailAccount = await prisma.emailAccount.findFirst({
     where: { userId, status: "ACTIVE" }
   });
   ```

2. **Import email tools**:
   ```typescript
   import { EMAIL_TOOLS } from "@/lib/chat/email-tool-definitions";
   ```

3. **Add email tools to tool list**:
   ```typescript
   const tools = [
     ...(enableTools ? FILE_TOOLS : []),
     ...(hasEmailAccount ? EMAIL_TOOLS : [])
   ];
   ```

### Phase 4: Create Email Tool Handler

**File**: `lib/chat/email-tool-handler.ts` (new file)

Create handler similar to `lib/chat/tool-handler.ts` but for email operations:

```typescript
export async function executeEmailToolCall(
  toolCall: ToolCall
): Promise<ToolResult> {
  try {
    const response = await fetch(`/api/email/${toolCall.name}`, {
      method: toolCall.name === "email_list" || toolCall.name === "email_get" 
        ? "GET" 
        : "POST",
      headers: { "Content-Type": "application/json" },
      body: toolCall.name === "email_list" || toolCall.name === "email_get"
        ? undefined
        : JSON.stringify(toolCall.arguments)
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: error.error || "Email operation failed"
      };
    }

    const result = await response.json();
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: result
    };
  } catch (error) {
    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
```

### Phase 5: Update Chat Route to Handle Email Tools

**File**: `app/api/chat/route.ts`

Modify the streaming logic to:
1. Detect email tool calls in Gemini responses
2. Execute email tools via the handler
3. Return tool results to Gemini for continued conversation

---

## 🔐 Security Considerations

### Current Security
✅ **Token Encryption**: OAuth tokens encrypted at rest (AES-256-GCM)
✅ **OAuth Flow**: Secure OAuth 2.0 with refresh tokens
✅ **Token Refresh**: Automatic refresh before expiration
✅ **User Isolation**: All operations scoped to authenticated user's account

### Additional Considerations for LLM Tools
⚠️ **Rate Limiting**: Consider rate limiting email tool calls to prevent abuse
⚠️ **Input Validation**: Validate email addresses, prevent injection attacks
⚠️ **Content Filtering**: Consider filtering sensitive content from LLM responses
⚠️ **Audit Logging**: Log all email operations for security auditing

---

## 📊 Summary: What LLM Should Be Able To Do

### ✅ Currently Available (via API, not LLM tools)
- List emails (inbox/sent/drafts)
- Get full email details
- Reply to emails
- Archive emails
- Delete emails

### ❌ Missing for LLM Integration
- **Tool definitions** for email operations
- **Tool handler** to execute email operations
- **Integration** with chat API to expose tools to LLM
- **Send email** API route and tool
- **Mark as read/unread** API route and tool

### 🎯 Recommended Priority
1. **High Priority**: `email_list`, `email_get`, `email_reply` (most common use cases)
2. **Medium Priority**: `email_send`, `email_archive`, `email_delete`
3. **Low Priority**: `email_mark_read`, `email_search` (can use `email_list` with query)

---

## 📝 Next Steps

1. **Create missing API routes** (`/api/email/send`, `/api/email/mark-read`)
2. **Create email tool definitions** (`lib/chat/email-tool-definitions.ts`)
3. **Create email tool handler** (`lib/chat/email-tool-handler.ts`)
4. **Integrate email tools** into chat API route
5. **Test email tools** with LLM function calling
6. **Add error handling** and user-friendly error messages
7. **Add rate limiting** for email operations
8. **Document email tools** for LLM usage

---

## 🔗 Related Files

- **API Routes**: `app/api/email/*`
- **Email Client**: `lib/email/gmail-client.ts`
- **Tool Definitions**: `lib/chat/tool-definitions.ts` (file system tools)
- **Tool Handler**: `lib/chat/tool-handler.ts` (file system tools)
- **Chat API**: `app/api/chat/route.ts`
- **Gemini Client**: `lib/clients/gemini.ts`

