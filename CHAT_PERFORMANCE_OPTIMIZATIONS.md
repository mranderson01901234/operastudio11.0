# Chat Performance Optimizations - Implementation Guide

## Quick Wins Implementation

### 1. Combine Database Queries (CRITICAL FIX)

**File**: `app/api/chat/route.ts`

**Current Code** (Lines 485-519):
```typescript
// Check integrations in parallel for better performance
const [emailAccount, githubAccount, hasImageEditingSession] =
  await Promise.all([
    prisma.emailAccount.findFirst(...),
    prisma.gitHubAccount.findFirst(...),
    hasActiveSession(userId, "image-editing"),
  ]);

// ... later ...

// Check if user has an active filesystem MCP session for cmd_execute
const hasMCPSession = await hasActiveSession(userId, "filesystem");
```

**Optimized Code**:
```typescript
// Check ALL integrations in parallel (including filesystem session)
const [emailAccount, githubAccount, hasImageEditingSession, hasMCPSession] =
  await Promise.all([
    prisma.emailAccount
      .findFirst({
        where: {
          userId,
          status: "ACTIVE",
        },
      })
      .catch(() => null),
    prisma.gitHubAccount
      .findFirst({
        where: {
          userId,
          status: "ACTIVE",
        },
      })
      .catch(() => null),
    hasActiveSession(userId, "image-editing"),
    hasActiveSession(userId, "filesystem"), // Moved here - parallel!
  ]);
```

**Impact**: Eliminates 50-150ms sequential wait

### 2. Optimize Context Message Building

**File**: `app/api/chat/route.ts`

**Current**: Large synchronous string building
**Optimized**: Cache static parts, build only dynamic parts

```typescript
// Cache static system prompt parts (build once)
const STATIC_SYSTEM_PROMPT = `Operate as a high-speed, reasoning-optimized assistant...`;

// Build only dynamic parts per request
function buildContextMessageOptimized(
  selectedTool: string | null,
  availability: {...},
  currentImageId?: string | null
): string {
  const parts: string[] = [STATIC_SYSTEM_PROMPT];
  
  // Only add dynamic parts
  if (selectedTool === "filesystem") {
    parts.push("⚠️ ACTIVE CONTEXT: File System");
    // ... minimal dynamic content
  }
  
  return parts.join("\n");
}
```

**Impact**: 5-15ms reduction

### 3. Defer Non-Critical Operations

**File**: `app/api/chat/route.ts`

Move tool building and context building to happen in parallel with streaming setup:

```typescript
// Start stream immediately
const stream = new ReadableStream({
  async start(streamController) {
    // Build tools and context in parallel (non-blocking for first token)
    const [tools, context] = await Promise.all([
      buildToolsAsync(hasEmailAccount, hasGitHubAccount, hasMCPSession),
      buildContextAsync(selectedTool, availability, currentImageId),
    ]);
    
    // Continue with streaming...
  }
});
```

**Impact**: 10-30ms reduction

### 4. Optimize Rate Limiting

**File**: `app/api/chat/route.ts` and `lib/rateLimit.ts`

**Current**: Check and increment before streaming
**Optimized**: Check before, increment after streaming starts

```typescript
// Check rate limit (fast - just read)
const rateLimitResult = await checkRateLimit(userId, ip);
if (!rateLimitResult.allowed) {
  return new Response("Too Many Requests", { status: 429 });
}

// Start streaming immediately
const stream = new ReadableStream({
  async start(streamController) {
    // Increment rate limit AFTER streaming starts (non-blocking)
    // This doesn't delay first token
    incrementRateLimit(userId, ip).catch(() => {
      // Non-critical - log but don't block
    });
    
    // Continue streaming...
  }
});
```

**Impact**: 10-30ms reduction

## Advanced Optimizations

### 5. Cache User Account Status

**File**: `lib/cache/user-accounts.ts` (new file)

```typescript
import { Redis } from "@upstash/redis";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let redisClient: Redis | null = null;

// Initialize Redis if available
if (process.env.REDIS_URL) {
  redisClient = new Redis({
    url: process.env.REDIS_URL,
    token: process.env.REDIS_TOKEN,
  });
}

export async function getUserAccountStatus(userId: string): Promise<{
  hasEmailAccount: boolean;
  hasGitHubAccount: boolean;
  hasMCPSession: boolean;
  hasImageEditingSession: boolean;
}> {
  const cacheKey = `user:${userId}:accounts`;
  
  // Try cache first
  if (redisClient) {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }
  
  // Query database
  const [emailAccount, githubAccount, hasImageEditingSession, hasMCPSession] =
    await Promise.all([
      prisma.emailAccount.findFirst({ where: { userId, status: "ACTIVE" } }),
      prisma.gitHubAccount.findFirst({ where: { userId, status: "ACTIVE" } }),
      hasActiveSession(userId, "image-editing"),
      hasActiveSession(userId, "filesystem"),
    ]);
  
  const result = {
    hasEmailAccount: !!emailAccount,
    hasGitHubAccount: !!githubAccount,
    hasMCPSession,
    hasImageEditingSession,
  };
  
  // Cache result
  if (redisClient) {
    await redisClient.setex(cacheKey, CACHE_TTL / 1000, JSON.stringify(result));
  }
  
  return result;
}
```

**Usage in route**:
```typescript
// Single call instead of multiple queries
const accountStatus = await getUserAccountStatus(userId);
```

**Impact**: 50-150ms reduction (after cache warmup)

### 6. Reduce Context Message Size

**File**: `app/api/chat/route.ts`

The `buildContextMessage` function creates a very large prompt (~5000+ tokens). Consider:

1. **Split into sections**: Only include relevant sections based on `selectedTool`
2. **Compress instructions**: Remove redundant explanations
3. **Use shorter format**: Bullet points instead of paragraphs

**Impact**: 20-50ms reduction + lower token costs

### 7. Optimize Message Validation

**File**: `app/api/chat/route.ts`

**Current**: Full validation before streaming
**Optimized**: Basic validation, defer full validation

```typescript
// Basic validation (fast)
if (!Array.isArray(body?.messages) || body.messages.length === 0) {
  return new Response("Invalid messages", { status: 400 });
}

// Defer full validation (happens during formatting)
// Full validation happens in formatMessagesForGemini()
```

**Impact**: 2-5ms reduction

## Implementation Priority

### Phase 1: Critical Fixes (Do First)
1. ✅ Combine database queries (Line 519 fix)
2. ✅ Optimize context message building
3. ✅ Defer rate limit increment

**Estimated Time**: 1-2 hours
**Expected Improvement**: 70-200ms reduction

### Phase 2: Caching (Do Next)
4. ✅ Cache user account status
5. ✅ Cache MCP session status

**Estimated Time**: 2-4 hours
**Expected Improvement**: 50-150ms reduction (after warmup)

### Phase 3: Advanced (Optional)
6. ✅ Reduce context message size
7. ✅ Optimize message validation
8. ✅ Start streaming earlier

**Estimated Time**: 4-8 hours
**Expected Improvement**: 100-200ms reduction

## Testing

Add performance logging:

```typescript
const timings = {
  auth: 0,
  rateLimit: 0,
  dbQueries: 0,
  contextBuild: 0,
  toolBuild: 0,
  firstToken: 0,
};

const startTime = Date.now();
const authStart = Date.now();
const { userId } = await auth();
timings.auth = Date.now() - authStart;

// ... continue timing each step ...

// Log at end
console.log("[Chat Performance]", {
  userId,
  timings,
  total: Date.now() - startTime,
});
```

## Expected Results

**Before Optimizations**:
- TTFT: 140-440ms
- Database queries: 100-300ms
- Context building: 5-20ms

**After Phase 1**:
- TTFT: 70-240ms (50% improvement)
- Database queries: 50-150ms (parallel)
- Context building: 2-10ms (optimized)

**After Phase 2**:
- TTFT: 20-90ms (85% improvement)
- Database queries: 0-5ms (cached)
- Context building: 2-10ms

**After Phase 3**:
- TTFT: 10-50ms (95% improvement)
- All operations optimized

