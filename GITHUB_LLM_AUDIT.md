# GitHub Feature & LLM Integration Audit

**Date:** 2025-01-27  
**Purpose:** Audit GitHub feature implementation and LLM's ability to interact with user's GitHub repositories and files

---

## Executive Summary

### Current State
✅ **GitHub UI & API Infrastructure**: Fully implemented  
❌ **LLM Integration**: **NOT IMPLEMENTED** - LLM cannot interact with GitHub repositories

### Key Finding
The GitHub feature has complete UI components and API routes, but **zero LLM tool integration**. The LLM has no way to interact with GitHub repositories, files, issues, or pull requests.

---

## What EXISTS (Infrastructure)

### ✅ 1. GitHub Authentication & Account Management

**Status:** ✅ Fully Implemented

**Components:**
- `prisma/schema.prisma` - `GitHubAccount` model with encrypted token storage
- `app/api/github/connect/route.ts` - OAuth connection initiation
- `app/api/github/callback/route.ts` - OAuth callback handler
- `app/api/github/account/route.ts` - Account status endpoint
- `lib/github/github-client.ts` - GitHub API client with token management

**Capabilities:**
- User can connect GitHub account via OAuth 2.0
- Tokens encrypted at rest (AES-256-GCM)
- Automatic token refresh handling
- User-scoped operations (all queries filtered by `userId`)

### ✅ 2. GitHub API Routes

**Status:** ✅ Fully Implemented

**Available Endpoints:**
- `GET /api/github/repos` - List user repositories
- `GET /api/github/repo/[owner]/[repo]` - Get repository details
- `GET /api/github/repo/[owner]/[repo]/files` - List repository files/directories
- `GET /api/github/repo/[owner]/[repo]/file` - Get file content
- `GET /api/github/repo/[owner]/[repo]/issues` - List issues
- `GET /api/github/repo/[owner]/[repo]/pulls` - List pull requests
- `GET /api/github/repo/[owner]/[repo]/actions/runs` - List workflow runs

**GitHub Client Methods:**
- `getUser()` - Get authenticated user info
- `listRepos()` - List repositories with filtering/sorting
- `getRepo()` - Get repository details
- `getRepoContents()` - Get file tree or file content
- `getFile()` - Get specific file content
- `createOrUpdateFile()` - Create or update files
- `listCommits()` - List commits
- `createIssue()` / `listIssues()` - Issue management
- `createPullRequest()` / `listPullRequests()` - PR management
- `listWorkflowRuns()` - GitHub Actions runs

### ✅ 3. GitHub UI Components

**Status:** ✅ Fully Implemented

**Components:**
- `contexts/github-context.tsx` - State management for GitHub feature
- `components/github/repository-list.tsx` - Repository list sidebar
- `components/github/repository-file-tree.tsx` - File tree sidebar
- `components/github/repository-viewer.tsx` - Main repository viewer (50/50 split)
- `components/github/repository-header.tsx` - Repository header with stats
- `components/github/repository-tabs.tsx` - Tab navigation (Code, Issues, PRs, etc.)
- `components/github/code-tab.tsx` - Code tab content
- `components/github/issues-tab.tsx` - Issues tab
- `components/github/pull-requests-tab.tsx` - Pull requests tab
- `components/github/actions-tab.tsx` - GitHub Actions tab
- `components/github/projects-tab.tsx` - Projects tab
- `components/github/wiki-tab.tsx` - Wiki tab
- `components/github/security-tab.tsx` - Security tab
- `components/github/insights-tab.tsx` - Insights tab
- `components/github/settings-tab.tsx` - Settings tab

**UI Features:**
- Repository list with search/filter
- File tree navigation
- File content viewing
- All GitHub tabs implemented
- GitHub-styled UI matching official design

### ✅ 4. Sidebar Integration

**Status:** ✅ Fully Implemented

**Integration:**
- `components/layout/app-sidebar.tsx` - Shows GitHub components when GitHub tool selected
- `components/layout/sidebar-nav.tsx` - GitHub navigation item
- Sidebar switches between repository list and file tree views
- Split view integration in `app/page.tsx`

---

## What's MISSING (LLM Integration)

### ❌ 1. GitHub Tool Definitions

**Status:** ❌ **NOT IMPLEMENTED**

**What's Needed:**
- `lib/chat/github-tool-definitions.ts` - Tool definitions for LLM
- Similar to `lib/chat/tool-definitions.ts` (file system tools)
- Similar to `lib/chat/email-tool-definitions.ts` (email tools)

**Required Tools:**
```typescript
// Tools that need to be defined:
- github_list_repos          // List user repositories
- github_get_repo           // Get repository details
- github_list_files         // List repository files/directories
- github_read_file          // Read file content
- github_write_file         // Create/update file
- github_list_commits       // List commits
- github_create_issue       // Create issue
- github_list_issues        // List issues
- github_create_pr          // Create pull request
- github_list_prs           // List pull requests
- github_list_workflows     // List GitHub Actions runs
```

**Current State:**
- ❌ No GitHub tool definitions exist
- ❌ No file `lib/chat/github-tool-definitions.ts`
- ❌ LLM has no knowledge of GitHub tools

### ❌ 2. Tool Handler Integration

**Status:** ❌ **NOT IMPLEMENTED**

**What's Needed:**
- Update `lib/chat/tool-handler.ts` to handle GitHub tools
- Add `executeGitHubToolCall()` function (similar to `executeEmailToolCall()`)
- Route GitHub tools to GitHub API endpoints

**Current State:**
- ✅ `executeEmailToolCall()` exists for email tools
- ✅ `executeToolCall()` routes email tools and file system tools
- ❌ No GitHub tool handling logic
- ❌ GitHub tools would fail if called

**Required Implementation:**
```typescript
// In lib/chat/tool-handler.ts
async function executeGitHubToolCall(toolCall: ToolCall): Promise<ToolResult> {
  // Map GitHub tool names to API endpoints
  const githubToolEndpoints: Record<string, { method: string; path: string }> = {
    github_list_repos: { method: "GET", path: "/api/github/repos" },
    github_get_repo: { method: "GET", path: "/api/github/repo/[owner]/[repo]" },
    github_read_file: { method: "GET", path: "/api/github/repo/[owner]/[repo]/file" },
    github_list_files: { method: "GET", path: "/api/github/repo/[owner]/[repo]/files" },
    github_list_issues: { method: "GET", path: "/api/github/repo/[owner]/[repo]/issues" },
    github_list_prs: { method: "GET", path: "/api/github/repo/[owner]/[repo]/pulls" },
    // ... etc
  };
  
  // Execute API call and return result
}
```

### ❌ 3. Chat API Integration

**Status:** ❌ **NOT IMPLEMENTED**

**What's Needed:**
- Update `app/api/chat/route.ts` to check for GitHub account
- Add GitHub tools to `availableTools` array when GitHub account exists
- Similar to how email tools are added when email account exists

**Current State:**
```typescript
// app/api/chat/route.ts (lines 98-119)
// Check if MCP session is active - file system tools are only available when MCP is connected
const hasMCPSession = await hasActiveMCPSession(userId);

// Check if email account is active - email tools are available when email account exists
const hasEmailAccount = await prisma.emailAccount.findFirst({...});

// Build tools array based on what's available
const availableTools: ToolDefinition[] = [];

// Add file system tools if MCP session is active
if (hasMCPSession && (body?.enableTools !== false)) {
  availableTools.push(...FILE_TOOLS);
}

// Add email tools if email account is active
if (hasEmailAccount) {
  availableTools.push(...EMAIL_TOOLS);
}

// ❌ MISSING: GitHub account check and GitHub tools
```

**Required Implementation:**
```typescript
// Check if GitHub account is active
const hasGitHubAccount = await prisma.gitHubAccount.findFirst({
  where: {
    userId,
    status: "ACTIVE",
  },
}).then(account => !!account).catch(() => false);

// Add GitHub tools if GitHub account is active
if (hasGitHubAccount) {
  availableTools.push(...GITHUB_TOOLS);
}
```

### ❌ 4. Import GitHub Tools

**Status:** ❌ **NOT IMPLEMENTED**

**What's Needed:**
- Import GitHub tool definitions in `app/api/chat/route.ts`
- Similar to how `FILE_TOOLS` and `EMAIL_TOOLS` are imported

**Current State:**
```typescript
// app/api/chat/route.ts (lines 9-10)
import { FILE_TOOLS, type ToolDefinition } from "@/lib/chat/tool-definitions";
import { EMAIL_TOOLS } from "@/lib/chat/email-tool-definitions";
// ❌ MISSING: import { GITHUB_TOOLS } from "@/lib/chat/github-tool-definitions";
```

---

## Detailed Capability Analysis

### What the LLM CANNOT Do (Current State)

❌ **Cannot list user repositories**
- No `github_list_repos` tool
- LLM has no way to discover user's repositories

❌ **Cannot read repository files**
- No `github_read_file` tool
- LLM cannot access file content from GitHub

❌ **Cannot write/update repository files**
- No `github_write_file` tool
- LLM cannot create or modify files in repositories

❌ **Cannot list repository files/directories**
- No `github_list_files` tool
- LLM cannot explore repository structure

❌ **Cannot interact with issues**
- No `github_create_issue` or `github_list_issues` tools
- LLM cannot create or view issues

❌ **Cannot interact with pull requests**
- No `github_create_pr` or `github_list_prs` tools
- LLM cannot create or view PRs

❌ **Cannot view commits**
- No `github_list_commits` tool
- LLM cannot see commit history

❌ **Cannot interact with GitHub Actions**
- No `github_list_workflows` tool
- LLM cannot view workflow runs

### What the LLM SHOULD Be Able To Do (After Implementation)

✅ **List repositories**
- `github_list_repos` - List all user repositories
- Filter by type (all/owner/member), sort, pagination

✅ **Read repository files**
- `github_read_file` - Read file content from any repository
- Support branch/ref parameter

✅ **Write/update repository files**
- `github_write_file` - Create or update files
- Automatic commit creation with commit message

✅ **Explore repository structure**
- `github_list_files` - List files and directories
- Recursive directory listing

✅ **Manage issues**
- `github_create_issue` - Create new issues
- `github_list_issues` - List issues with filters
- `github_get_issue` - Get issue details

✅ **Manage pull requests**
- `github_create_pr` - Create pull requests
- `github_list_prs` - List pull requests
- `github_get_pr` - Get PR details

✅ **View commits**
- `github_list_commits` - List commits with filters
- Filter by author, path, date range

✅ **View GitHub Actions**
- `github_list_workflows` - List workflow runs
- Filter by branch, status, event

---

## Implementation Requirements

### Phase 1: Create GitHub Tool Definitions

**File:** `lib/chat/github-tool-definitions.ts`

**Required Tools:**
1. `github_list_repos` - List repositories
2. `github_get_repo` - Get repository details
3. `github_list_files` - List files/directories
4. `github_read_file` - Read file content
5. `github_write_file` - Create/update file
6. `github_list_commits` - List commits
7. `github_create_issue` - Create issue
8. `github_list_issues` - List issues
9. `github_create_pr` - Create pull request
10. `github_list_prs` - List pull requests
11. `github_list_workflows` - List workflow runs

**Tool Definition Format:**
```typescript
export const GITHUB_TOOLS: ToolDefinition[] = [
  {
    name: "github_list_repos",
    description: "List user's GitHub repositories. Use this to discover available repositories.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter by type: 'all', 'owner', or 'member' (default: 'all')"
        },
        sort: {
          type: "string",
          description: "Sort by: 'created', 'updated', 'pushed', or 'full_name' (default: 'updated')"
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
          description: "Page number (default: 1)"
        }
      },
      required: []
    }
  },
  // ... more tools
];
```

### Phase 2: Update Tool Handler

**File:** `lib/chat/tool-handler.ts`

**Changes Required:**
1. Add `executeGitHubToolCall()` function
2. Update `executeToolCall()` to route GitHub tools
3. Map GitHub tool names to API endpoints
4. Handle GitHub API responses and errors

**Implementation Pattern:**
```typescript
// Route GitHub tools to GitHub API
if (toolCall.name.startsWith("github_")) {
  return executeGitHubToolCall(toolCall);
}
```

### Phase 3: Update Chat API

**File:** `app/api/chat/route.ts`

**Changes Required:**
1. Import `GITHUB_TOOLS` from `lib/chat/github-tool-definitions`
2. Check for active GitHub account
3. Add GitHub tools to `availableTools` array when account exists

**Code Location:** Around line 98-119

### Phase 4: Create GitHub API Routes (if missing)

**Check Required Routes:**
- ✅ `GET /api/github/repos` - EXISTS
- ✅ `GET /api/github/repo/[owner]/[repo]` - EXISTS
- ✅ `GET /api/github/repo/[owner]/[repo]/files` - EXISTS
- ✅ `GET /api/github/repo/[owner]/[repo]/file` - EXISTS (read only)
- ✅ `GET /api/github/repo/[owner]/[repo]/issues` - EXISTS (list only)
- ✅ `GET /api/github/repo/[owner]/[repo]/pulls` - EXISTS (list only)
- ✅ `GET /api/github/repo/[owner]/[repo]/actions/runs` - EXISTS
- ❌ `POST /api/github/repo/[owner]/[repo]/file` - **MISSING** (for write operations)
- ❌ `POST /api/github/repo/[owner]/[repo]/issues` - **MISSING** (for create issue)
- ❌ `POST /api/github/repo/[owner]/[repo]/pulls` - **MISSING** (for create PR)
- ❌ `GET /api/github/repo/[owner]/[repo]/commits` - **MISSING** (for list commits)

**Note:** The `GitHubClient` (`lib/github/github-client.ts`) has methods for these operations:
- ✅ `createOrUpdateFile()` - Method exists, but no API route
- ✅ `createIssue()` - Method exists, but no API route
- ✅ `createPullRequest()` - Method exists, but no API route
- ✅ `listCommits()` - Method exists, but no API route

**Action Required:** Create API routes that expose these write operations for LLM tool calls.

---

## Comparison with Existing Features

### File System Tools (MCP)

**Status:** ✅ Fully Implemented

**Tools Available:**
- `fs_read` - Read files
- `fs_write` - Write files
- `fs_list` - List directories
- `fs_delete` - Delete files
- `cmd_execute` - Execute commands

**Integration:**
- ✅ Tool definitions exist (`lib/chat/tool-definitions.ts`)
- ✅ Tool handler routes to MCP proxy (`lib/chat/tool-handler.ts`)
- ✅ Chat API checks for MCP session (`app/api/chat/route.ts`)
- ✅ Tools added when MCP session active

### Email Tools

**Status:** ✅ Fully Implemented

**Tools Available:**
- `email_list` - List emails
- `email_get` - Get email details
- `email_send` - Send email
- `email_reply` - Reply to email
- `email_archive` - Archive email
- `email_delete` - Delete email
- `email_mark_read` - Mark as read

**Integration:**
- ✅ Tool definitions exist (`lib/chat/email-tool-definitions.ts`)
- ✅ Tool handler routes to email API (`lib/chat/tool-handler.ts`)
- ✅ Chat API checks for email account (`app/api/chat/route.ts`)
- ✅ Tools added when email account active

### GitHub Tools

**Status:** ❌ **NOT IMPLEMENTED**

**Tools Needed:**
- `github_list_repos` - List repositories
- `github_read_file` - Read files
- `github_write_file` - Write files
- `github_list_files` - List files
- `github_create_issue` - Create issues
- `github_list_issues` - List issues
- `github_create_pr` - Create PRs
- `github_list_prs` - List PRs
- `github_list_commits` - List commits
- `github_list_workflows` - List workflows

**Integration:**
- ❌ Tool definitions **DO NOT EXIST**
- ❌ Tool handler **DOES NOT ROUTE** GitHub tools
- ❌ Chat API **DOES NOT CHECK** for GitHub account
- ❌ Tools **NOT ADDED** when GitHub account active

---

## Implementation Checklist

### Step 1: Create GitHub Tool Definitions
- [ ] Create `lib/chat/github-tool-definitions.ts`
- [ ] Define `GITHUB_TOOLS` array with all 11+ tools
- [ ] Match format of `FILE_TOOLS` and `EMAIL_TOOLS`
- [ ] Include detailed descriptions for each tool
- [ ] Define parameter schemas for each tool

### Step 2: Update Tool Handler
- [ ] Add `executeGitHubToolCall()` function to `lib/chat/tool-handler.ts`
- [ ] Map GitHub tool names to API endpoints
- [ ] Handle GET and POST requests
- [ ] Handle URL parameters (owner, repo, path, etc.)
- [ ] Update `executeToolCall()` to route GitHub tools
- [ ] Add error handling for GitHub API errors

### Step 3: Update Chat API
- [ ] Import `GITHUB_TOOLS` in `app/api/chat/route.ts`
- [ ] Check for active GitHub account (similar to email account check)
- [ ] Add GitHub tools to `availableTools` when account exists
- [ ] Update error messages to mention GitHub if needed

### Step 4: Create Missing API Routes (if needed)
- [ ] `POST /api/github/repo/[owner]/[repo]/file` - Write file
- [ ] `POST /api/github/repo/[owner]/[repo]/issues` - Create issue
- [ ] `POST /api/github/repo/[owner]/[repo]/pulls` - Create PR
- [ ] `GET /api/github/repo/[owner]/[repo]/commits` - List commits

### Step 5: Testing
- [ ] Test GitHub account detection
- [ ] Test tool definitions are loaded
- [ ] Test each GitHub tool execution
- [ ] Test error handling
- [ ] Test LLM can successfully use GitHub tools

---

## Summary

### Current State: ❌ LLM Cannot Interact with GitHub

**What Works:**
- ✅ GitHub authentication (OAuth)
- ✅ GitHub API routes (read operations)
- ✅ GitHub UI components
- ✅ GitHub client library

**What's Missing:**
- ❌ GitHub tool definitions for LLM
- ❌ Tool handler integration
- ❌ Chat API integration
- ❌ Some write API routes

### Required Implementation

1. **Create GitHub Tool Definitions** (`lib/chat/github-tool-definitions.ts`)
   - Define 11+ GitHub tools
   - Match existing tool definition format

2. **Update Tool Handler** (`lib/chat/tool-handler.ts`)
   - Add GitHub tool execution function
   - Route GitHub tools to API endpoints

3. **Update Chat API** (`app/api/chat/route.ts`)
   - Check for GitHub account
   - Add GitHub tools when account exists

4. **Create Missing API Routes** (if needed)
   - Write file endpoint
   - Create issue endpoint
   - Create PR endpoint
   - List commits endpoint

### Estimated Effort

- **Tool Definitions:** 2-3 hours
- **Tool Handler:** 2-3 hours
- **Chat API Integration:** 1 hour
- **Missing API Routes:** 2-3 hours (if needed)
- **Testing:** 2-3 hours

**Total:** ~10-13 hours of development work

---

## Next Steps

1. **Review this audit** with team
2. **Prioritize implementation** based on user needs
3. **Start with Phase 1** (Tool Definitions)
4. **Test incrementally** after each phase
5. **Document tool usage** for LLM prompts

---

**End of Audit**

