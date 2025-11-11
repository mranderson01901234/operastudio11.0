# GitHub Feature Implementation Plan

**Date:** 2025-01-27  
**Status:** Planning Phase  
**Approach:** Follow Email Feature Pattern

---

## Executive Summary

This document outlines the optimal implementation plan for GitHub integration, following the same authentication and architectural patterns established for:
1. **Local Environment** (Device-based authentication with PKCE + HMAC tokens)
2. **Email Feature** (OAuth 2.0 with encrypted token storage)

The GitHub feature will use **OAuth 2.0 authentication** (similar to Email) and integrate with the LLM via tool definitions (similar to both Email and File System features).

---

## 1. Architecture Audit: Current Authentication Patterns

### 1.1 Web User Authentication (All Features)

**Pattern:** Clerk-based session authentication
- **Middleware:** `middleware.ts` protects `/api/*`, `/chat*`, `/dashboard*` routes
- **Verification:** All API routes use `const { userId } = await auth()` from `@clerk/nextjs/server`
- **Session Management:** Clerk handles session cookies (httpOnly, secure, sameSite=strict)
- **User Isolation:** All operations scoped to `userId` from Clerk session

**Files:**
- `middleware.ts` - Route protection
- All API routes verify `userId` server-side

**Status:** ✅ Consistent across all features

---

### 1.2 Local Environment Authentication Pattern

**Pattern:** Device-based authentication with PKCE + HMAC tokens

**Flow:**
1. User authenticates via Clerk (web)
2. User initiates pairing from web UI
3. Backend generates pairing code + PKCE challenge
4. Launcher (native app) pairs device using Ed25519 keypair
5. Backend validates PKCE proof, stores device
6. Sessions use HMAC tokens (per-session secret)
7. Device token stored encrypted in launcher

**Database Models:**
- `Device` - Device registration (status: PENDING, ACTIVE, REVOKED)
- `DeviceKey` - Key rotation support
- `LocalSession` - Active sessions (status: ACTIVE, ENDED, REVOKED)

**Security:**
- PKCE for pairing
- Ed25519 for device identity
- HMAC tokens for session auth
- Loopback-only (localhost) for session endpoints

**Files:**
- `app/api/devices/pair/route.ts` - Device pairing
- `app/api/devices/activate/route.ts` - Device activation
- `app/api/sessions/start/route.ts` - Session start
- `lib/utils/hmac-token.ts` - HMAC token utilities
- `prisma/schema.prisma` - Device/Session models

**Status:** ✅ Well-established pattern (not applicable to GitHub)

---

### 1.3 Email Feature Authentication Pattern

**Pattern:** OAuth 2.0 with encrypted token storage

**Flow:**
1. User authenticates via Clerk (web)
2. User clicks "Connect Gmail" in UI
3. Backend initiates OAuth flow (`GET /api/email/gmail/connect`)
   - Generates CSRF state token
   - Redirects to Google OAuth consent screen
4. User grants permissions
5. Google redirects to callback (`GET /api/email/gmail/callback`)
6. Backend exchanges code for tokens
7. Backend fetches user email from Gmail API
8. Backend stores encrypted tokens in database
9. Tokens automatically refreshed before expiration

**Database Model:**
```prisma
model EmailAccount {
  id                String            @id @default(uuid())
  userId            String            @map("user_id")
  provider          String            // "GMAIL", "OUTLOOK", etc.
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
- OAuth 2.0 with PKCE (implicit in Google's flow)
- Tokens encrypted at rest (AES-256-GCM)
- Automatic token refresh
- User-scoped operations

**Files:**
- `app/api/email/gmail/connect/route.ts` - OAuth initiation
- `app/api/email/gmail/callback/route.ts` - OAuth callback
- `app/api/email/account/route.ts` - Account management
- `lib/utils/token-encryption.ts` - Token encryption utilities
- `lib/email/gmail-client.ts` - Gmail API client with auto-refresh

**Status:** ✅ Well-established pattern (APPLICABLE TO GITHUB)

---

## 2. GitHub Feature: Optimal Implementation Plan

### 2.1 Authentication Strategy

**Follow Email Pattern:** OAuth 2.0 with encrypted token storage

**Rationale:**
- GitHub uses OAuth 2.0 (same as Gmail)
- No device pairing needed (web-only)
- Same security model (encrypted tokens, auto-refresh)
- Same user experience (connect from web UI)

**Differences from Email:**
- GitHub OAuth scopes: `repo`, `read:org`, `workflow`, etc.
- GitHub API endpoints: `https://api.github.com/*`
- GitHub token refresh: Uses refresh token (if available) or re-auth

---

### 2.2 Database Schema

**Create `GitHubAccount` model** (mirror `EmailAccount` structure):

```prisma
enum GitHubAccountStatus {
  ACTIVE
  EXPIRED
  REVOKED
  ERROR
}

model GitHubAccount {
  id                String              @id @default(uuid())
  userId            String              @map("user_id")
  provider          String              @default("GITHUB") // Future: "GITHUB_ENTERPRISE"
  username          String              // GitHub username
  accessTokenEnc    String              @map("access_token_enc") @db.Text
  refreshTokenEnc   String?             @map("refresh_token_enc") @db.Text // Optional (GitHub doesn't always provide)
  expiresAt         DateTime?           @map("expires_at")
  scope             String              @db.Text // OAuth scopes granted
  status            GitHubAccountStatus  @default(ACTIVE)
  lastSyncedAt      DateTime?           @map("last_synced_at")
  createdAt         DateTime            @default(now()) @map("created_at")
  updatedAt         DateTime            @updatedAt @map("updated_at")

  @@unique([userId, provider, username])
  @@index([userId])
  @@index([status])
  @@map("github_accounts")
}
```

**Migration:**
- Create migration: `prisma migrate dev --name add_github_account`
- Follow same pattern as `20251110054133_add_email_account/migration.sql`

---

### 2.3 API Routes Structure

**Follow Email API Pattern:**

```
app/api/github/
├── connect/
│   └── route.ts          # GET - Initiate OAuth flow
├── callback/
│   └── route.ts          # GET - Handle OAuth callback
├── account/
│   └── route.ts          # GET - Get user's GitHub account
├── repos/
│   └── route.ts          # GET - List repositories
├── repo/
│   └── [owner]/
│       └── [repo]/
│           ├── route.ts  # GET - Get repo details
│           ├── files/
│           │   └── route.ts  # GET - List files
│           ├── file/
│           │   └── route.ts  # GET/PUT - Read/write file
│           └── commits/
│               └── route.ts  # GET/POST - List/create commits
├── issues/
│   └── route.ts          # GET/POST - List/create issues
├── pull-requests/
│   └── route.ts          # GET/POST - List/create PRs
└── webhooks/
    └── route.ts          # POST - Handle GitHub webhooks (future)
```

**Key Routes:**

1. **`GET /api/github/connect`** - Initiate GitHub OAuth
   - Generate CSRF state token
   - Build GitHub OAuth URL with scopes
   - Return `authUrl` and `state`

2. **`GET /api/github/callback`** - Handle OAuth callback
   - Verify state token
   - Exchange code for access token
   - Fetch user info from GitHub API
   - Store encrypted tokens in database
   - Redirect to success page

3. **`GET /api/github/account`** - Get connected account
   - Return account info (username, status)

4. **`GET /api/github/repos`** - List repositories
   - Query GitHub API for user repos
   - Support filtering (public/private, sort, etc.)

5. **`GET /api/github/repo/[owner]/[repo]/files`** - List repo files
   - Get repository tree via GitHub API
   - Support path filtering, recursive listing

6. **`GET /api/github/repo/[owner]/[repo]/file`** - Read file
   - Get file content via GitHub API
   - Support branch/ref parameter

7. **`PUT /api/github/repo/[owner]/[repo]/file`** - Write file
   - Create/update file via GitHub API
   - Requires commit message
   - Creates commit automatically

8. **`GET /api/github/repo/[owner]/[repo]/commits`** - List commits
   - Get commit history

9. **`POST /api/github/repo/[owner]/[repo]/commits`** - Create commit
   - Create commit with file changes

10. **`GET /api/github/issues`** - List issues
    - Query issues across repos or specific repo

11. **`POST /api/github/issues`** - Create issue
    - Create issue in repository

12. **`GET /api/github/pull-requests`** - List PRs
    - Query pull requests

13. **`POST /api/github/pull-requests`** - Create PR
    - Create pull request

---

### 2.4 GitHub Client Library

**Create `lib/github/github-client.ts`** (mirror `lib/email/gmail-client.ts`):

```typescript
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/utils/token-encryption";

export class GitHubClient {
  private userId: string;
  private accessToken: string | null = null;
  private accountId: string | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Initialize client by loading account and tokens
   */
  async initialize(): Promise<void> {
    const account = await prisma.githubAccount.findFirst({
      where: {
        userId: this.userId,
        status: "ACTIVE",
      },
    });

    if (!account) {
      throw new Error("No active GitHub account found");
    }

    this.accountId = account.id;

    // Check if token needs refresh
    if (account.expiresAt && account.expiresAt < new Date()) {
      await this.refreshToken();
    } else {
      this.accessToken = decryptToken(account.accessTokenEnc);
    }
  }

  /**
   * Refresh access token (if refresh token available)
   */
  private async refreshToken(): Promise<void> {
    // GitHub doesn't always provide refresh tokens
    // If expired, user needs to re-authenticate
    throw new Error("Token expired. Please reconnect your GitHub account.");
  }

  /**
   * Make authenticated request to GitHub API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.accessToken) {
      await this.initialize();
    }

    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "OperaStudio/1.0",
      },
    });

    if (response.status === 401) {
      // Token expired or invalid
      throw new Error("GitHub token expired. Please reconnect your account.");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: `GitHub API error: ${response.statusText}`,
      }));
      throw new Error(error.message || "GitHub API error");
    }

    return response.json();
  }

  /**
   * Get authenticated user info
   */
  async getUser(): Promise<{ login: string; name?: string; email?: string }> {
    return this.request("/user");
  }

  /**
   * List repositories
   */
  async listRepos(options?: {
    type?: "all" | "owner" | "member";
    sort?: "created" | "updated" | "pushed" | "full_name";
    direction?: "asc" | "desc";
    per_page?: number;
    page?: number;
  }): Promise<Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    description?: string;
    updated_at: string;
  }>> {
    const params = new URLSearchParams();
    if (options?.type) params.set("type", options.type);
    if (options?.sort) params.set("sort", options.sort);
    if (options?.direction) params.set("direction", options.direction);
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));

    const query = params.toString();
    return this.request(`/user/repos${query ? `?${query}` : ""}`);
  }

  /**
   * Get repository contents
   */
  async getRepoContents(
    owner: string,
    repo: string,
    path: string = "",
    ref?: string
  ): Promise<Array<{
    name: string;
    path: string;
    type: "file" | "dir";
    size?: number;
    sha: string;
    url: string;
  }> | {
    name: string;
    path: string;
    type: "file";
    content: string;
    encoding: "base64";
    size: number;
    sha: string;
  }> {
    const params = new URLSearchParams();
    if (ref) params.set("ref", ref);

    const query = params.toString();
    return this.request(`/repos/${owner}/${repo}/contents/${path}${query ? `?${query}` : ""}`);
  }

  /**
   * Get file content
   */
  async getFile(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<{
    name: string;
    path: string;
    content: string;
    encoding: "base64";
    size: number;
    sha: string;
  }> {
    const contents = await this.getRepoContents(owner, repo, path, ref);
    if (Array.isArray(contents)) {
      throw new Error("Path is a directory, not a file");
    }
    return contents;
  }

  /**
   * Create or update file
   */
  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch?: string,
    sha?: string // Required for updates
  ): Promise<{
    content: {
      name: string;
      path: string;
      sha: string;
    };
    commit: {
      sha: string;
      message: string;
    };
  }> {
    const body: any = {
      message,
      content: Buffer.from(content).toString("base64"),
    };
    if (branch) body.branch = branch;
    if (sha) body.sha = sha; // Update existing file

    return this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: sha ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * List commits
   */
  async listCommits(
    owner: string,
    repo: string,
    options?: {
      sha?: string;
      path?: string;
      author?: string;
      since?: string;
      until?: string;
      per_page?: number;
      page?: number;
    }
  ): Promise<Array<{
    sha: string;
    commit: {
      message: string;
      author: { name: string; email: string; date: string };
    };
    author: { login: string };
  }>> {
    const params = new URLSearchParams();
    if (options?.sha) params.set("sha", options.sha);
    if (options?.path) params.set("path", options.path);
    if (options?.author) params.set("author", options.author);
    if (options?.since) params.set("since", options.since);
    if (options?.until) params.set("until", options.until);
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));

    const query = params.toString();
    return this.request(`/repos/${owner}/${repo}/commits${query ? `?${query}` : ""}`);
  }

  /**
   * Create issue
   */
  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body?: string,
    labels?: string[]
  ): Promise<{
    number: number;
    title: string;
    body?: string;
    state: "open" | "closed";
    html_url: string;
  }> {
    return this.request(`/repos/${owner}/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        labels,
      }),
    });
  }

  /**
   * List issues
   */
  async listIssues(
    owner: string,
    repo: string,
    options?: {
      state?: "open" | "closed" | "all";
      labels?: string;
      sort?: "created" | "updated" | "comments";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    }
  ): Promise<Array<{
    number: number;
    title: string;
    body?: string;
    state: "open" | "closed";
    labels: Array<{ name: string }>;
    html_url: string;
  }>> {
    const params = new URLSearchParams();
    if (options?.state) params.set("state", options.state);
    if (options?.labels) params.set("labels", options.labels);
    if (options?.sort) params.set("sort", options.sort);
    if (options?.direction) params.set("direction", options.direction);
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));

    const query = params.toString();
    return this.request(`/repos/${owner}/${repo}/issues${query ? `?${query}` : ""}`);
  }

  /**
   * Create pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string
  ): Promise<{
    number: number;
    title: string;
    body?: string;
    state: "open" | "closed" | "merged";
    html_url: string;
  }> {
    return this.request(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title,
        head,
        base,
        body,
      }),
    });
  }

  /**
   * List pull requests
   */
  async listPullRequests(
    owner: string,
    repo: string,
    options?: {
      state?: "open" | "closed" | "all";
      head?: string;
      base?: string;
      sort?: "created" | "updated" | "popularity";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    }
  ): Promise<Array<{
    number: number;
    title: string;
    body?: string;
    state: "open" | "closed" | "merged";
    head: { ref: string };
    base: { ref: string };
    html_url: string;
  }>> {
    const params = new URLSearchParams();
    if (options?.state) params.set("state", options.state);
    if (options?.head) params.set("head", options.head);
    if (options?.base) params.set("base", options.base);
    if (options?.sort) params.set("sort", options.sort);
    if (options?.direction) params.set("direction", options.direction);
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));

    const query = params.toString();
    return this.request(`/repos/${owner}/${repo}/pulls${query ? `?${query}` : ""}`);
  }
}
```

---

### 2.5 Tool Definitions for LLM

**Create `lib/chat/github-tool-definitions.ts`** (mirror `lib/chat/tool-definitions.ts`):

```typescript
export const GITHUB_TOOLS: ToolDefinition[] = [
  {
    name: "github_list_repos",
    description: "List GitHub repositories for the authenticated user. Use this to browse repositories, find specific repos, or see what repositories are available.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter by repository type: 'all', 'owner', or 'member' (default: 'all')"
        },
        sort: {
          type: "string",
          description: "Sort order: 'created', 'updated', 'pushed', or 'full_name' (default: 'updated')"
        },
        direction: {
          type: "string",
          description: "Sort direction: 'asc' or 'desc' (default: 'desc')"
        },
        per_page: {
          type: "number",
          description: "Number of results per page (default: 30, max: 100)"
        },
        page: {
          type: "number",
          description: "Page number for pagination (default: 1)"
        }
      },
      required: []
    }
  },
  {
    name: "github_get_repo",
    description: "Get details about a specific GitHub repository. Use this to get repository information, default branch, description, etc.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_list_files",
    description: "List files and directories in a GitHub repository. Use this to explore repository structure, find files, or browse directories.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        path: {
          type: "string",
          description: "Path within repository (default: root directory, e.g., 'src/components' or 'docs/README.md')"
        },
        ref: {
          type: "string",
          description: "Branch, tag, or commit SHA (default: default branch)"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_read_file",
    description: "Read the contents of a file from a GitHub repository. Use this to read source code, documentation, or any file content.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        path: {
          type: "string",
          description: "File path within repository (e.g., 'src/index.ts', 'README.md')"
        },
        ref: {
          type: "string",
          description: "Branch, tag, or commit SHA (default: default branch)"
        }
      },
      required: ["owner", "repo", "path"]
    }
  },
  {
    name: "github_write_file",
    description: "Create or update a file in a GitHub repository. This creates a commit automatically. Use this to modify files, create new files, or update documentation.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        path: {
          type: "string",
          description: "File path within repository (e.g., 'src/index.ts', 'README.md')"
        },
        content: {
          type: "string",
          description: "File content to write (plain text, will be base64 encoded)"
        },
        message: {
          type: "string",
          description: "Commit message describing the change"
        },
        branch: {
          type: "string",
          description: "Branch name (default: default branch, usually 'main' or 'master')"
        },
        sha: {
          type: "string",
          description: "SHA of file being updated (required for updates, get from github_read_file)"
        }
      },
      required: ["owner", "repo", "path", "content", "message"]
    }
  },
  {
    name: "github_list_commits",
    description: "List commits in a GitHub repository. Use this to see commit history, find specific commits, or track changes.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        sha: {
          type: "string",
          description: "SHA or branch to start listing commits from (default: default branch)"
        },
        path: {
          type: "string",
          description: "Filter commits by file path"
        },
        author: {
          type: "string",
          description: "Filter commits by author username"
        },
        since: {
          type: "string",
          description: "Filter commits after this date (ISO 8601 format, e.g., '2024-01-01T00:00:00Z')"
        },
        until: {
          type: "string",
          description: "Filter commits before this date (ISO 8601 format)"
        },
        per_page: {
          type: "number",
          description: "Number of results per page (default: 30, max: 100)"
        },
        page: {
          type: "number",
          description: "Page number for pagination (default: 1)"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_create_issue",
    description: "Create a new issue in a GitHub repository. Use this to report bugs, request features, or create tasks.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        title: {
          type: "string",
          description: "Issue title"
        },
        body: {
          type: "string",
          description: "Issue body/description (supports Markdown)"
        },
        labels: {
          type: "array",
          description: "Array of label names to apply to the issue",
          items: {
            type: "string"
          }
        }
      },
      required: ["owner", "repo", "title"]
    }
  },
  {
    name: "github_list_issues",
    description: "List issues in a GitHub repository. Use this to see open issues, closed issues, or search for specific issues.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        state: {
          type: "string",
          description: "Filter by state: 'open', 'closed', or 'all' (default: 'open')"
        },
        labels: {
          type: "string",
          description: "Comma-separated list of label names to filter by"
        },
        sort: {
          type: "string",
          description: "Sort order: 'created', 'updated', or 'comments' (default: 'created')"
        },
        direction: {
          type: "string",
          description: "Sort direction: 'asc' or 'desc' (default: 'desc')"
        },
        per_page: {
          type: "string",
          description: "Number of results per page (default: 30, max: 100)"
        },
        page: {
          type: "string",
          description: "Page number for pagination (default: 1)"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_create_pull_request",
    description: "Create a new pull request in a GitHub repository. Use this to propose changes, merge branches, or create PRs.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        title: {
          type: "string",
          description: "Pull request title"
        },
        head: {
          type: "string",
          description: "Branch name containing changes (e.g., 'feature-branch')"
        },
        base: {
          type: "string",
          description: "Branch name to merge into (default: 'main' or 'master')"
        },
        body: {
          type: "string",
          description: "Pull request description (supports Markdown)"
        }
      },
      required: ["owner", "repo", "title", "head", "base"]
    }
  },
  {
    name: "github_list_pull_requests",
    description: "List pull requests in a GitHub repository. Use this to see open PRs, closed PRs, or search for specific PRs.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        state: {
          type: "string",
          description: "Filter by state: 'open', 'closed', or 'all' (default: 'open')"
        },
        head: {
          type: "string",
          description: "Filter by head branch name"
        },
        base: {
          type: "string",
          description: "Filter by base branch name"
        },
        sort: {
          type: "string",
          description: "Sort order: 'created', 'updated', or 'popularity' (default: 'created')"
        },
        direction: {
          type: "string",
          description: "Sort direction: 'asc' or 'desc' (default: 'desc')"
        },
        per_page: {
          type: "number",
          description: "Number of results per page (default: 30, max: 100)"
        },
        page: {
          type: "number",
          description: "Page number for pagination (default: 1)"
        }
      },
      required: ["owner", "repo"]
    }
  }
];
```

---

### 2.6 Tool Handler Integration

**Update `lib/chat/tool-handler.ts`** to handle GitHub tools:

```typescript
/**
 * Execute a GitHub tool call via GitHub API routes.
 */
async function executeGitHubToolCall(toolCall: ToolCall): Promise<ToolResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000); // 60 second timeout

    try {
      // Map GitHub tool names to API endpoints
      const githubToolEndpoints: Record<string, { method: string; path: string }> = {
        github_list_repos: { method: "GET", path: "/api/github/repos" },
        github_get_repo: { method: "GET", path: "/api/github/repo" },
        github_list_files: { method: "GET", path: "/api/github/repo/files" },
        github_read_file: { method: "GET", path: "/api/github/repo/file" },
        github_write_file: { method: "PUT", path: "/api/github/repo/file" },
        github_list_commits: { method: "GET", path: "/api/github/repo/commits" },
        github_create_issue: { method: "POST", path: "/api/github/issues" },
        github_list_issues: { method: "GET", path: "/api/github/issues" },
        github_create_pull_request: { method: "POST", path: "/api/github/pull-requests" },
        github_list_pull_requests: { method: "GET", path: "/api/github/pull-requests" },
      };

      const endpoint = githubToolEndpoints[toolCall.name];
      if (!endpoint) {
        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: `Unknown GitHub tool: ${toolCall.name}`,
        };
      }

      // Build URL and request options
      let url = endpoint.path;
      const options: RequestInit = {
        method: endpoint.method,
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      };

      // Handle GET requests with query parameters
      if (endpoint.method === "GET") {
        const params = new URLSearchParams();
        
        // Common parameters
        if (toolCall.arguments.owner) params.set("owner", String(toolCall.arguments.owner));
        if (toolCall.arguments.repo) params.set("repo", String(toolCall.arguments.repo));
        if (toolCall.arguments.path) params.set("path", String(toolCall.arguments.path));
        if (toolCall.arguments.ref) params.set("ref", String(toolCall.arguments.ref));
        
        // Tool-specific parameters
        if (toolCall.name === "github_list_repos") {
          if (toolCall.arguments.type) params.set("type", String(toolCall.arguments.type));
          if (toolCall.arguments.sort) params.set("sort", String(toolCall.arguments.sort));
          if (toolCall.arguments.direction) params.set("direction", String(toolCall.arguments.direction));
          if (toolCall.arguments.per_page) params.set("per_page", String(toolCall.arguments.per_page));
          if (toolCall.arguments.page) params.set("page", String(toolCall.arguments.page));
        }
        // ... handle other GET tools similarly
        
        url = `${endpoint.path}?${params.toString()}`;
      } else {
        // POST/PUT requests - include body
        options.body = JSON.stringify(toolCall.arguments);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        let errorMessage = errorData.error || "GitHub operation failed";

        if (response.status === 401) {
          errorMessage = "Unauthorized. Please reconnect your GitHub account.";
        } else if (response.status === 404) {
          errorMessage = "Repository or resource not found. Check owner/repo/path.";
        } else if (response.status === 403) {
          errorMessage = "Permission denied. Check repository permissions and OAuth scopes.";
        }

        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: errorMessage,
          errorCode: response.status.toString(),
        };
      }

      const result = await response.json();

      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: result,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        throw new Error("GitHub operation timed out after 60 seconds");
      }
      throw fetchError;
    }
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof TypeError && error.message.includes("fetch")) {
      errorMessage = "Network error: Unable to reach GitHub API. Check your connection.";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: errorMessage,
    };
  }
}

// Update executeToolCall to route GitHub tools
export async function executeToolCall(
  toolCall: ToolCall,
  retryCount: number = 0
): Promise<ToolResult> {
  // Route GitHub tools to GitHub API
  if (toolCall.name.startsWith("github_")) {
    return executeGitHubToolCall(toolCall);
  }
  
  // Route email tools to email API
  if (toolCall.name.startsWith("email_")) {
    return executeEmailToolCall(toolCall);
  }

  // File system tools go through MCP proxy (existing behavior)
  // ... existing code ...
}
```

---

### 2.7 Chat API Integration

**Update `app/api/chat/route.ts`** to include GitHub tools:

```typescript
// Add import
import { GITHUB_TOOLS } from "@/lib/chat/github-tool-definitions";

// In POST handler, add GitHub account check:
const hasGitHubAccount = await prisma.githubAccount.findFirst({
  where: {
    userId,
    status: "ACTIVE",
  },
}).then(account => !!account).catch(() => false);

// Build tools array:
const availableTools: ToolDefinition[] = [];

if (hasMCPSession && (body?.enableTools !== false)) {
  availableTools.push(...FILE_TOOLS);
}

if (hasEmailAccount) {
  availableTools.push(...EMAIL_TOOLS);
}

if (hasGitHubAccount) {
  availableTools.push(...GITHUB_TOOLS);
}

// Update error message to mention GitHub:
const mentionsGitHubOps = /\b(github|repository|repo|commit|issue|pull request|pr)\b/i.test(messageContent);

if (mentionsGitHubOps) {
  message += "To use GitHub tools, please connect your GitHub account first.";
}
```

---

### 2.8 Environment Variables

**Add to `.env`:**

```bash
# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Token encryption (reuse from email)
EMAIL_ENCRYPTION_KEY=your_encryption_key_hex_32_bytes
```

**GitHub OAuth App Setup:**
1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Create new OAuth App
3. Set Authorization callback URL: `https://yourdomain.com/api/github/callback`
4. Request scopes: `repo`, `read:org`, `workflow` (as needed)
5. Copy Client ID and Client Secret

---

### 2.9 UI Components

**Create GitHub connection UI** (mirror email UI):

1. **`app/github/page.tsx`** - GitHub connection page
   - Show connection status
   - Button to connect GitHub
   - List connected account info

2. **`components/github/github-connect.tsx`** - Connection component
   - Handle OAuth flow initiation
   - Show connection status

3. **`contexts/github-context.tsx`** - GitHub state management
   - Track connection status
   - Provide account info

4. **Update `components/layout/sidebar-nav.tsx`** - Add GitHub link
   - Add "GitHub" to sidebar navigation

---

## 3. Implementation Phases

### Phase 1: Foundation (Database + OAuth)
1. ✅ Create `GitHubAccount` model in Prisma schema
2. ✅ Run migration
3. ✅ Create OAuth connect route (`/api/github/connect`)
4. ✅ Create OAuth callback route (`/api/github/callback`)
5. ✅ Create account route (`/api/github/account`)
6. ✅ Create GitHub client library (`lib/github/github-client.ts`)
7. ✅ Test OAuth flow end-to-end

### Phase 2: Core API Routes
1. ✅ Create repos route (`/api/github/repos`)
2. ✅ Create repo details route (`/api/github/repo/[owner]/[repo]`)
3. ✅ Create files route (`/api/github/repo/[owner]/[repo]/files`)
4. ✅ Create file read route (`/api/github/repo/[owner]/[repo]/file`)
5. ✅ Create file write route (`PUT /api/github/repo/[owner]/[repo]/file`)
6. ✅ Test all routes with Postman/curl

### Phase 3: LLM Integration
1. ✅ Create GitHub tool definitions (`lib/chat/github-tool-definitions.ts`)
2. ✅ Update tool handler (`lib/chat/tool-handler.ts`)
3. ✅ Update chat API (`app/api/chat/route.ts`)
4. ✅ Test tool execution via LLM

### Phase 4: Advanced Features
1. ✅ Create commits route (`/api/github/repo/[owner]/[repo]/commits`)
2. ✅ Create issues routes (`/api/github/issues`)
3. ✅ Create pull requests routes (`/api/github/pull-requests`)
4. ✅ Add corresponding tool definitions
5. ✅ Test all tools

### Phase 5: UI Integration
1. ✅ Create GitHub page (`app/github/page.tsx`)
2. ✅ Create connection component
3. ✅ Create GitHub context
4. ✅ Update sidebar navigation
5. ✅ Test UI flow

---

## 4. Security Considerations

### 4.1 OAuth Security
- ✅ **CSRF Protection**: State token in OAuth flow
- ✅ **Token Encryption**: AES-256-GCM encryption at rest (reuse `token-encryption.ts`)
- ✅ **Token Refresh**: Handle token expiration gracefully
- ✅ **Scope Limitation**: Request minimal required scopes

### 4.2 API Security
- ✅ **User Isolation**: All operations scoped to authenticated `userId`
- ✅ **Rate Limiting**: GitHub API has rate limits (5000 requests/hour for authenticated)
- ✅ **Input Validation**: Validate owner/repo/path parameters
- ✅ **Error Handling**: Don't expose sensitive error details

### 4.3 Token Management
- ✅ **Automatic Refresh**: Check token expiration before API calls
- ✅ **Revocation Handling**: Handle revoked tokens gracefully
- ✅ **Secure Storage**: Encrypted tokens in database

---

## 5. Testing Strategy

### 5.1 Unit Tests
- GitHub client methods
- Token encryption/decryption
- API route handlers

### 5.2 Integration Tests
- OAuth flow end-to-end
- API routes with mock GitHub responses
- Tool execution flow

### 5.3 Manual Testing
- Connect GitHub account
- List repositories
- Read/write files
- Create issues/PRs
- LLM tool execution

---

## 6. Comparison: Email vs GitHub Implementation

| Aspect | Email Feature | GitHub Feature |
|--------|--------------|----------------|
| **Auth Pattern** | OAuth 2.0 | OAuth 2.0 ✅ |
| **Token Storage** | Encrypted (AES-256-GCM) | Encrypted (AES-256-GCM) ✅ |
| **Database Model** | `EmailAccount` | `GitHubAccount` ✅ |
| **Client Library** | `gmail-client.ts` | `github-client.ts` ✅ |
| **API Routes** | `/api/email/*` | `/api/github/*` ✅ |
| **Tool Definitions** | `EMAIL_TOOLS` | `GITHUB_TOOLS` ✅ |
| **Tool Handler** | `executeEmailToolCall` | `executeGitHubToolCall` ✅ |
| **Chat Integration** | Check `hasEmailAccount` | Check `hasGitHubAccount` ✅ |
| **UI Components** | Email page/context | GitHub page/context ✅ |

**Conclusion:** GitHub feature follows **exact same pattern** as Email feature. ✅

---

## 7. Key Differences from Email

1. **API Endpoint**: GitHub uses `https://api.github.com` (not Gmail API)
2. **Scopes**: GitHub scopes (`repo`, `read:org`) vs Gmail scopes
3. **Token Refresh**: GitHub may not always provide refresh tokens (user may need to re-auth)
4. **Rate Limits**: GitHub has stricter rate limits (5000/hour authenticated)
5. **Operations**: GitHub has more complex operations (commits, PRs, issues)

---

## 8. Recommended Implementation Order

1. **Start with OAuth** (Phase 1) - Get authentication working first
2. **Add basic file operations** (Phase 2) - Read/write files (most common use case)
3. **Integrate with LLM** (Phase 3) - Make tools available to LLM
4. **Add advanced features** (Phase 4) - Commits, issues, PRs
5. **Polish UI** (Phase 5) - User-facing components

---

## 9. Success Criteria

✅ User can connect GitHub account via OAuth  
✅ User can list repositories  
✅ User can read files from repositories  
✅ User can write files to repositories  
✅ LLM can use GitHub tools via function calling  
✅ Tokens are encrypted at rest  
✅ All operations are user-scoped  
✅ Error handling is graceful  
✅ UI shows connection status  

---

## 10. Next Steps

1. **Review this plan** with team
2. **Set up GitHub OAuth App** in GitHub settings
3. **Add environment variables** to `.env`
4. **Begin Phase 1 implementation** (Database + OAuth)
5. **Test OAuth flow** end-to-end
6. **Continue with remaining phases**

---

**End of Implementation Plan**

