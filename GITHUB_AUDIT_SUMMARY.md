# GitHub Feature Audit Summary

**Date:** 2025-01-27  
**Purpose:** Audit current authentication patterns and recommend optimal GitHub implementation

---

## Executive Summary

After auditing the web application, I've identified **two distinct authentication patterns**:

1. **Local Environment** - Device-based authentication (PKCE + HMAC tokens)
2. **Email Feature** - OAuth 2.0 authentication (encrypted token storage)

**Recommendation:** GitHub feature should follow the **Email Feature pattern** (OAuth 2.0) since:
- GitHub is a web-based service (no device pairing needed)
- Same OAuth 2.0 flow as Gmail
- Same security model (encrypted tokens, user-scoped operations)
- Same user experience (connect from web UI)

---

## Current Authentication Patterns

### Pattern 1: Local Environment (Device-Based)

**Use Case:** Local file system access via native launcher

**Authentication Flow:**
1. User authenticates via Clerk (web)
2. User initiates device pairing from web UI
3. Backend generates pairing code + PKCE challenge
4. Native launcher pairs device using Ed25519 keypair
5. Sessions use HMAC tokens (per-session secret)
6. Device token stored encrypted in launcher

**Key Components:**
- `Device` model - Device registration
- `LocalSession` model - Active sessions
- PKCE + Ed25519 for pairing
- HMAC tokens for session auth
- Loopback-only endpoints

**Status:** ✅ Well-established, not applicable to GitHub

---

### Pattern 2: Email Feature (OAuth 2.0)

**Use Case:** Gmail integration via OAuth

**Authentication Flow:**
1. User authenticates via Clerk (web)
2. User clicks "Connect Gmail" in UI
3. Backend initiates OAuth flow (`/api/email/gmail/connect`)
4. User grants permissions on Google consent screen
5. Google redirects to callback (`/api/email/gmail/callback`)
6. Backend exchanges code for tokens
7. Tokens encrypted and stored in database
8. Tokens automatically refreshed before expiration

**Key Components:**
- `EmailAccount` model - OAuth account storage
- `lib/utils/token-encryption.ts` - AES-256-GCM encryption
- `lib/email/gmail-client.ts` - API client with auto-refresh
- OAuth routes: `/api/email/gmail/connect`, `/api/email/gmail/callback`
- Account route: `/api/email/account`

**Database Schema:**
```prisma
model EmailAccount {
  id                String            @id @default(uuid())
  userId            String            @map("user_id")
  provider          String            // "GMAIL", "OUTLOOK"
  email             String
  accessTokenEnc    String            @map("access_token_enc") @db.Text
  refreshTokenEnc   String            @map("refresh_token_enc") @db.Text
  expiresAt         DateTime?         @map("expires_at")
  scope             String            @db.Text
  status            EmailAccountStatus @default(ACTIVE)
  lastSyncedAt      DateTime?         @map("last_synced_at")
  createdAt         DateTime          @default(now()) @map("created_at")
  updatedAt         DateTime          @updatedAt @map("updated_at")

  @@unique([userId, provider, email])
  @@index([userId])
  @@index([status])
  @@map("email_accounts")
}
```

**Security:**
- OAuth 2.0 with CSRF protection (state token)
- Tokens encrypted at rest (AES-256-GCM)
- Automatic token refresh
- User-scoped operations (all queries filtered by `userId`)

**Status:** ✅ Well-established, **APPLICABLE TO GITHUB**

---

## Recommended GitHub Implementation

### Follow Email Pattern Exactly

**Rationale:**
1. **Same OAuth Flow**: GitHub uses OAuth 2.0 (same as Gmail)
2. **Same Security Model**: Encrypted tokens, user-scoped operations
3. **Same User Experience**: Connect from web UI, no device pairing
4. **Proven Pattern**: Email feature is working and well-tested

### Implementation Checklist

#### 1. Database Schema
- [ ] Create `GitHubAccount` model (mirror `EmailAccount`)
- [ ] Add `GitHubAccountStatus` enum
- [ ] Run Prisma migration

#### 2. OAuth Routes
- [ ] Create `/api/github/connect` (mirror `/api/email/gmail/connect`)
- [ ] Create `/api/github/callback` (mirror `/api/email/gmail/callback`)
- [ ] Create `/api/github/account` (mirror `/api/email/account`)

#### 3. Client Library
- [ ] Create `lib/github/github-client.ts` (mirror `lib/email/gmail-client.ts`)
- [ ] Implement GitHub API methods
- [ ] Add automatic token refresh logic

#### 4. API Routes
- [ ] Create `/api/github/repos` - List repositories
- [ ] Create `/api/github/repo/[owner]/[repo]/files` - List files
- [ ] Create `/api/github/repo/[owner]/[repo]/file` - Read/write file
- [ ] Create `/api/github/repo/[owner]/[repo]/commits` - List commits
- [ ] Create `/api/github/issues` - List/create issues
- [ ] Create `/api/github/pull-requests` - List/create PRs

#### 5. LLM Integration
- [ ] Create `lib/chat/github-tool-definitions.ts` (mirror `lib/chat/tool-definitions.ts`)
- [ ] Update `lib/chat/tool-handler.ts` to handle GitHub tools
- [ ] Update `app/api/chat/route.ts` to include GitHub tools

#### 6. UI Components
- [ ] Create `app/github/page.tsx` (mirror `app/email/page.tsx`)
- [ ] Create `components/github/github-connect.tsx`
- [ ] Create `contexts/github-context.tsx`
- [ ] Update sidebar navigation

#### 7. Environment Variables
- [ ] Add `GITHUB_CLIENT_ID` to `.env`
- [ ] Add `GITHUB_CLIENT_SECRET` to `.env`
- [ ] Reuse `EMAIL_ENCRYPTION_KEY` for token encryption

---

## Key Architectural Decisions

### ✅ Use OAuth 2.0 (Not Device-Based)
- **Reason**: GitHub is web-based, no native launcher needed
- **Pattern**: Follow Email feature exactly

### ✅ Encrypt Tokens at Rest
- **Method**: AES-256-GCM (reuse `token-encryption.ts`)
- **Storage**: Database (`GitHubAccount.accessTokenEnc`)

### ✅ User-Scoped Operations
- **Pattern**: All API routes verify `userId` from Clerk
- **Database**: All queries filtered by `userId`

### ✅ Automatic Token Refresh
- **Pattern**: Check expiration before API calls
- **Fallback**: Re-authenticate if refresh token unavailable

### ✅ Tool-Based LLM Integration
- **Pattern**: Create tool definitions (like Email and File System)
- **Handler**: Route GitHub tools to GitHub API routes

---

## Security Considerations

### ✅ OAuth Security
- CSRF protection via state token
- Secure redirect URI validation
- Minimal scope requests

### ✅ Token Security
- Encryption at rest (AES-256-GCM)
- No tokens in logs or error messages
- Secure token storage in database

### ✅ API Security
- User isolation (all operations scoped to `userId`)
- Rate limiting (GitHub: 5000 requests/hour authenticated)
- Input validation (owner/repo/path parameters)
- Error handling (don't expose sensitive details)

---

## Comparison Matrix

| Feature | Local Environment | Email Feature | GitHub Feature (Recommended) |
|---------|------------------|---------------|------------------------------|
| **Auth Method** | Device pairing (PKCE + HMAC) | OAuth 2.0 | OAuth 2.0 ✅ |
| **Token Storage** | Device token (launcher) | Encrypted (DB) | Encrypted (DB) ✅ |
| **User Auth** | Clerk (web) | Clerk (web) | Clerk (web) ✅ |
| **Session Model** | `LocalSession` | `EmailAccount` | `GitHubAccount` ✅ |
| **Client Library** | MCP server | `gmail-client.ts` | `github-client.ts` ✅ |
| **LLM Integration** | Tool definitions | Tool definitions | Tool definitions ✅ |
| **UI Pattern** | Device pairing flow | OAuth connect flow | OAuth connect flow ✅ |

---

## Implementation Phases

### Phase 1: Foundation (Database + OAuth)
**Goal**: Get OAuth authentication working
- Database schema
- OAuth connect/callback routes
- Account management
- Test OAuth flow

### Phase 2: Core API Routes
**Goal**: Basic GitHub operations
- List repositories
- Read/write files
- Test API routes

### Phase 3: LLM Integration
**Goal**: Make GitHub tools available to LLM
- Tool definitions
- Tool handler updates
- Chat API integration
- Test tool execution

### Phase 4: Advanced Features
**Goal**: Complete GitHub feature set
- Commits, issues, PRs
- Additional tool definitions
- Test all operations

### Phase 5: UI Polish
**Goal**: User-facing components
- GitHub connection page
- Connection status UI
- Sidebar integration
- Test user flow

---

## Success Criteria

✅ User can connect GitHub account via OAuth  
✅ User can list repositories  
✅ User can read/write files  
✅ LLM can use GitHub tools  
✅ Tokens encrypted at rest  
✅ All operations user-scoped  
✅ Error handling graceful  
✅ UI shows connection status  

---

## Next Steps

1. **Review implementation plan** (`GITHUB_FEATURE_IMPLEMENTATION_PLAN.md`)
2. **Set up GitHub OAuth App** in GitHub settings
3. **Add environment variables** to `.env`
4. **Begin Phase 1** (Database + OAuth)
5. **Test OAuth flow** end-to-end
6. **Continue with remaining phases**

---

**End of Audit Summary**

