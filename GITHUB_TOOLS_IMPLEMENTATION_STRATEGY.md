# GitHub Tools Implementation Strategy

**Date:** 2025-01-27  
**Goal:** Implement GitHub tools without overloading the LLM or breaking existing functionality

---

## Current Architecture Analysis

### ✅ Current Tool Loading Pattern

**File:** `app/api/chat/route.ts` (lines 97-119)

```typescript
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
```

**Current Behavior:**
- ✅ File System tools: Loaded when MCP session is active
- ✅ Email tools: Loaded when email account exists
- ⚠️ **Both can be loaded simultaneously** if both conditions are met
- ⚠️ **No context awareness** - tools loaded regardless of `selectedTool`

### Current Tool Counts

- **File System Tools:** 5 tools (`fs_read`, `fs_write`, `fs_list`, `fs_delete`, `cmd_execute`)
- **Email Tools:** 7 tools (`email_list`, `email_get`, `email_send`, `email_reply`, `email_archive`, `email_delete`, `email_mark_read`)
- **Current Max:** ~12 tools when both are active
- **GitHub Tools Needed:** ~11 tools
- **Potential Max:** ~23 tools if all loaded simultaneously ⚠️

---

## Problem Statement

### Concerns
1. **Tool Overload**: Too many tools can confuse the LLM
2. **Context Confusion**: LLM might use wrong tool set (e.g., `fs_write` when user wants GitHub)
3. **Performance**: More tools = more tokens = slower responses
4. **Maintainability**: Need to preserve existing file system and email functionality

### Current State
- ✅ File System tools work perfectly
- ✅ Email tools work perfectly
- ❌ No GitHub tools yet
- ⚠️ No context-aware tool loading

---

## Recommended Strategy: **Load All Tools + Context System Message**

### Approach: Keep Current Behavior + Add Context Awareness

**Key Insight:** Users need flexibility - they should be able to use email tools from GitHub section, file system tools from email section, etc.

**Strategy:** 
1. **Load ALL available tools** (current behavior - gives maximum flexibility)
2. **Add system message** indicating which context is "active" (selectedTool)
3. **LLM prioritizes active context** but can still use other tools when needed

### Implementation Pattern

```typescript
// In app/api/chat/route.ts

// Get selectedTool from request body (passed from frontend)
const selectedTool = body?.selectedTool as "chat" | "filesystem" | "email" | "github" | null;

// Check availability
const hasMCPSession = await hasActiveMCPSession(userId);
const hasEmailAccount = await prisma.emailAccount.findFirst({...}).then(...);
const hasGitHubAccount = await prisma.gitHubAccount.findFirst({...}).then(...);

// Build tools array - LOAD ALL AVAILABLE TOOLS (flexibility)
const availableTools: ToolDefinition[] = [];

// File system tools: When MCP session active
if (hasMCPSession && (body?.enableTools !== false)) {
  availableTools.push(...FILE_TOOLS);
}

// Email tools: When email account exists
if (hasEmailAccount) {
  availableTools.push(...EMAIL_TOOLS);
}

// GitHub tools: When GitHub account exists (NEW)
if (hasGitHubAccount) {
  availableTools.push(...GITHUB_TOOLS);
}

// Build context system message (NEW)
const contextMessage = buildContextMessage(selectedTool, {
  hasMCPSession,
  hasEmailAccount,
  hasGitHubAccount,
});

// Add context message to messages array
if (contextMessage) {
  messages.unshift({
    role: "system",
    content: contextMessage,
  });
}
```

**Context Message Builder:**
```typescript
function buildContextMessage(
  selectedTool: string | null,
  availability: { hasMCPSession: boolean; hasEmailAccount: boolean; hasGitHubAccount: boolean }
): string {
  const parts: string[] = [];
  
  if (selectedTool === "filesystem") {
    parts.push("⚠️ ACTIVE CONTEXT: File System");
    parts.push("The user is currently working with their local file system.");
    parts.push("Prioritize file system tools (fs_read, fs_write, fs_list, cmd_execute) for file operations.");
    parts.push("However, you can still use email tools (email_*) or GitHub tools (github_*) if the user requests them.");
  } else if (selectedTool === "email") {
    parts.push("⚠️ ACTIVE CONTEXT: Email");
    parts.push("The user is currently working with their email.");
    parts.push("Prioritize email tools (email_list, email_send, email_reply, etc.) for email operations.");
    parts.push("However, you can still use file system tools (fs_*) or GitHub tools (github_*) if the user requests them.");
  } else if (selectedTool === "github") {
    parts.push("⚠️ ACTIVE CONTEXT: GitHub");
    parts.push("The user is currently working with GitHub repositories.");
    parts.push("Prioritize GitHub tools (github_list_repos, github_read_file, github_write_file, etc.) for GitHub operations.");
    parts.push("However, you can still use file system tools (fs_*) or email tools (email_*) if the user requests them.");
  } else {
    parts.push("⚠️ ACTIVE CONTEXT: General Chat");
    parts.push("The user is in general chat mode. All available tools can be used as needed.");
  }
  
  parts.push("");
  parts.push("Available tool sets:");
  if (availability.hasMCPSession) parts.push("- File System tools (fs_*)");
  if (availability.hasEmailAccount) parts.push("- Email tools (email_*)");
  if (availability.hasGitHubAccount) parts.push("- GitHub tools (github_*)");
  
  return parts.join("\n");
}
```

### Benefits

✅ **Maximum Flexibility**
- User can use email tools from GitHub section
- User can use file system tools from email section
- User can use GitHub tools from file system section
- No need to switch sections for cross-context operations

✅ **Context Awareness**
- LLM knows which context is "active" via system message
- LLM prioritizes active context tools
- But can still use other tools when requested

✅ **Preserves Existing Functionality**
- File system tools unchanged
- Email tools unchanged
- Current behavior maintained (load all available tools)

✅ **Clear Tool Guidance**
- System message guides LLM on which tools to prioritize
- Tool descriptions already clarify when to use each tool
- LLM can make intelligent choices

---

## Implementation Plan

### Phase 1: Add `selectedTool` to Chat API Request

**File:** `components/chat/chat-interface.tsx`

**Change:** Pass `selectedTool` in request body

```typescript
// In sendMessage function
const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: toOutboundMessages(messages),
    provider: "gemini-flash",
    enableTools: true,
    selectedTool: selectedTool, // NEW: Pass selectedTool
  }),
});
```

**File:** `app/api/chat/route.ts`

**Change:** Extract `selectedTool` from request body

```typescript
const body = await request.json();
const selectedTool = body?.selectedTool as "chat" | "filesystem" | "email" | "github" | null;
```

### Phase 2: Create GitHub Tool Definitions

**File:** `lib/chat/github-tool-definitions.ts` (NEW)

**Structure:** Match `email-tool-definitions.ts` pattern

```typescript
import type { ToolDefinition } from "./tool-definitions";

export const GITHUB_TOOLS: ToolDefinition[] = [
  {
    name: "github_list_repos",
    description: "List user's GitHub repositories...",
    parameters: { ... }
  },
  // ... 10 more tools
];
```

**Tool Naming:** Use `github_` prefix to avoid conflicts
- ✅ `github_list_repos` (not `list_repos`)
- ✅ `github_read_file` (not `read_file`)
- ✅ Clear separation from file system tools

### Phase 3: Update Tool Handler

**File:** `lib/chat/tool-handler.ts`

**Change:** Add GitHub tool routing

```typescript
export async function executeToolCall(
  toolCall: ToolCall,
  retryCount: number = 0
): Promise<ToolResult> {
  // Route email tools to email API
  if (toolCall.name.startsWith("email_")) {
    return executeEmailToolCall(toolCall);
  }

  // Route GitHub tools to GitHub API (NEW)
  if (toolCall.name.startsWith("github_")) {
    return executeGitHubToolCall(toolCall);
  }

  // File system tools go through MCP proxy (existing behavior)
  // ...
}
```

**Add:** `executeGitHubToolCall()` function (similar to `executeEmailToolCall()`)

### Phase 4: Update Chat API - Load All Tools + Add Context Message

**File:** `app/api/chat/route.ts`

**Change:** Load all available tools + add context system message

```typescript
// Check availability
const hasMCPSession = await hasActiveMCPSession(userId);
const hasEmailAccount = await prisma.emailAccount.findFirst({...}).then(...);
const hasGitHubAccount = await prisma.gitHubAccount.findFirst({
  where: { userId, status: "ACTIVE" },
}).then(account => !!account).catch(() => false);

// Build tools array - LOAD ALL AVAILABLE TOOLS (flexibility)
const availableTools: ToolDefinition[] = [];

// File system tools: When MCP session active
if (hasMCPSession && (body?.enableTools !== false)) {
  availableTools.push(...FILE_TOOLS);
}

// Email tools: When email account exists
if (hasEmailAccount) {
  availableTools.push(...EMAIL_TOOLS);
}

// GitHub tools: When GitHub account exists (NEW)
if (hasGitHubAccount) {
  availableTools.push(...GITHUB_TOOLS);
}

// Build context system message (NEW)
const selectedTool = body?.selectedTool as "chat" | "filesystem" | "email" | "github" | null;
const contextMessage = buildContextMessage(selectedTool, {
  hasMCPSession,
  hasEmailAccount,
  hasGitHubAccount,
});

// Add context message to messages array (if provided)
if (contextMessage) {
  messages.unshift({
    role: "system",
    content: contextMessage,
  });
}
```

**Add Context Message Builder Function:**
```typescript
function buildContextMessage(
  selectedTool: string | null,
  availability: { hasMCPSession: boolean; hasEmailAccount: boolean; hasGitHubAccount: boolean }
): string | null {
  if (!selectedTool || selectedTool === "chat") {
    return null; // No context message for chat mode
  }
  
  const parts: string[] = [];
  
  if (selectedTool === "filesystem") {
    parts.push("⚠️ ACTIVE CONTEXT: File System");
    parts.push("The user is currently working with their local file system.");
    parts.push("Prioritize file system tools (fs_read, fs_write, fs_list, cmd_execute) for file operations.");
    parts.push("However, you can still use email tools (email_*) or GitHub tools (github_*) if the user requests them.");
  } else if (selectedTool === "email") {
    parts.push("⚠️ ACTIVE CONTEXT: Email");
    parts.push("The user is currently working with their email.");
    parts.push("Prioritize email tools (email_list, email_send, email_reply, etc.) for email operations.");
    parts.push("However, you can still use file system tools (fs_*) or GitHub tools (github_*) if the user requests them.");
  } else if (selectedTool === "github") {
    parts.push("⚠️ ACTIVE CONTEXT: GitHub");
    parts.push("The user is currently working with GitHub repositories.");
    parts.push("Prioritize GitHub tools (github_list_repos, github_read_file, github_write_file, etc.) for GitHub operations.");
    parts.push("However, you can still use file system tools (fs_*) or email tools (email_*) if the user requests them.");
  }
  
  parts.push("");
  parts.push("Available tool sets:");
  if (availability.hasMCPSession) parts.push("- File System tools (fs_*)");
  if (availability.hasEmailAccount) parts.push("- Email tools (email_*)");
  if (availability.hasGitHubAccount) parts.push("- GitHub tools (github_*)");
  
  return parts.join("\n");
}
```

### Phase 5: Create Missing API Routes (if needed)

**Check:** Do we need write API routes?
- `POST /api/github/repo/[owner]/[repo]/file` - Write file
- `POST /api/github/repo/[owner]/[repo]/issues` - Create issue
- `POST /api/github/repo/[owner]/[repo]/pulls` - Create PR
- `GET /api/github/repo/[owner]/[repo]/commits` - List commits

**Note:** `GitHubClient` has methods for these, but API routes may be missing.

---

## Alternative Strategies Considered

### ❌ Option A: Strict Context-Based Loading

**Approach:** Only load tools for the selected tool (no cross-context access)

**Problems:**
- ❌ User can't use email tools from GitHub section
- ❌ User can't use file system tools from email section
- ❌ Too restrictive - creates friction

**Verdict:** ❌ Rejected - Too restrictive

### ✅ Option B: Load All Tools + Context Message (RECOMMENDED)

**Approach:** Load all available tools, but add system message indicating active context

**Benefits:**
- ✅ Maximum flexibility - use any tool from any context
- ✅ Context awareness via system message
- ✅ LLM prioritizes active context but can use others
- ✅ Preserves existing behavior
- ✅ No UI friction

**Verdict:** ✅ **RECOMMENDED**

### ⚠️ Option C: Load All Tools Without Context

**Approach:** Load all tools, no context message

**Problems:**
- ⚠️ LLM might not know which context is active
- ⚠️ Could use wrong tool set

**Verdict:** ⚠️ Acceptable but not optimal - context message helps

---

## Tool Count Analysis

### Current State (Before GitHub)

| Context | Tools Loaded | Count |
|---------|-------------|-------|
| Any context | File System + Email (if both available) | 12 max |

### After GitHub Implementation (Recommended)

| Context | Tools Loaded | Count |
|---------|-------------|-------|
| Any context | All available tools (File System + Email + GitHub) | 23 max |

### Comparison

**Before:** Max 12 tools (file system + email)  
**After:** Max 23 tools (all tools when all accounts/sessions active)

**Analysis:**
- ✅ **Flexibility:** User can use any tool from any context
- ✅ **Context Awareness:** System message tells LLM which context is active
- ✅ **Tool Guidance:** LLM prioritizes active context but can use others
- ⚠️ **Tool Count:** 23 tools max, but:
  - Tool descriptions are clear about when to use each
  - System message provides context guidance
  - LLM models handle this well (Gemini supports many tools)
  - Current behavior already loads all available tools

---

## Migration Strategy

### Step 1: Preserve Existing Behavior

**Backward Compatibility:**
- If `selectedTool` is not provided, default to current behavior (load all available tools)
- This ensures existing functionality continues to work

```typescript
// Default behavior if selectedTool not provided
const selectedTool = body?.selectedTool as "chat" | "filesystem" | "email" | "github" | null;
const effectiveTool = selectedTool || "chat"; // Default to "chat" for backward compatibility
```

### Step 2: Gradual Rollout

1. **Phase 1:** Add `selectedTool` parameter (optional, defaults to "chat")
2. **Phase 2:** Implement GitHub tools
3. **Phase 3:** Update frontend to pass `selectedTool`
4. **Phase 4:** Test context-aware loading
5. **Phase 5:** Remove backward compatibility if desired

### Step 3: Testing

**Test Cases:**
- ✅ File system tools work when `selectedTool === "filesystem"`
- ✅ Email tools work when `selectedTool === "email"`
- ✅ GitHub tools work when `selectedTool === "github"`
- ✅ All tools work when `selectedTool === "chat"`
- ✅ Backward compatibility (no `selectedTool` provided)

---

## Implementation Checklist

### Phase 1: Frontend Changes
- [ ] Update `chat-interface.tsx` to pass `selectedTool` in request
- [ ] Ensure `selectedTool` is available from `useFileSystem()` hook
- [ ] Test that `selectedTool` is correctly passed

### Phase 2: GitHub Tool Definitions
- [ ] Create `lib/chat/github-tool-definitions.ts`
- [ ] Define all 11 GitHub tools
- [ ] Use `github_` prefix for all tool names
- [ ] Match format of `email-tool-definitions.ts`

### Phase 3: Tool Handler
- [ ] Add `executeGitHubToolCall()` function
- [ ] Update `executeToolCall()` to route GitHub tools
- [ ] Map GitHub tool names to API endpoints
- [ ] Handle errors appropriately

### Phase 4: Chat API Integration
- [ ] Import `GITHUB_TOOLS` from `github-tool-definitions.ts`
- [ ] Check for GitHub account
- [ ] Implement context-aware tool loading
- [ ] Add backward compatibility (default to "chat" if not provided)

### Phase 5: Missing API Routes
- [ ] Check if write routes exist
- [ ] Create `POST /api/github/repo/[owner]/[repo]/file` if needed
- [ ] Create `POST /api/github/repo/[owner]/[repo]/issues` if needed
- [ ] Create `POST /api/github/repo/[owner]/[repo]/pulls` if needed
- [ ] Create `GET /api/github/repo/[owner]/[repo]/commits` if needed

### Phase 6: Testing
- [ ] Test file system tools still work
- [ ] Test email tools still work
- [ ] Test GitHub tools work
- [ ] Test context-aware loading
- [ ] Test backward compatibility

---

## Risk Mitigation

### Risk 1: Breaking Existing Functionality

**Mitigation:**
- ✅ Keep file system and email tool loading logic unchanged
- ✅ Only add new conditional checks
- ✅ Default to "chat" mode for backward compatibility
- ✅ Test existing functionality thoroughly

### Risk 2: Tool Overload in Chat Mode

**Mitigation:**
- ✅ Chat mode is explicit user choice
- ✅ User understands they're in general chat mode
- ✅ Can optimize later if needed (e.g., lazy loading)

### Risk 3: LLM Confusion

**Mitigation:**
- ✅ Clear tool naming (`github_` prefix)
- ✅ Focused tool sets per context
- ✅ Detailed tool descriptions
- ✅ Test with various prompts

---

## Success Criteria

✅ **File System Tools:** Continue to work exactly as before  
✅ **Email Tools:** Continue to work exactly as before  
✅ **GitHub Tools:** Work correctly when GitHub tool selected  
✅ **Context Awareness:** Tools load based on `selectedTool`  
✅ **Backward Compatibility:** Works without `selectedTool` parameter  
✅ **No Tool Overload:** Max 11 tools per focused context  

---

## Next Steps

1. **Review this strategy** with team
2. **Approve approach** (context-aware loading)
3. **Start Phase 1** (frontend changes)
4. **Implement incrementally** (test after each phase)
5. **Monitor performance** and adjust if needed

---

**End of Strategy Document**

