# Chat Performance Audit - Time To First Token (TTFT) Optimization

## Current Bottlenecks Identified

### 🔴 Critical Issues (Blocking Streaming)

1. **Sequential Database Queries** (~50-150ms)
   - Line 519: `hasMCPSession` query runs AFTER parallel queries complete
   - Should be included in the parallel batch (lines 486-505)
   - **Impact**: Adds 50-150ms delay before streaming starts

2. **Rate Limiting Check** (~10-50ms)
   - Line 458: Synchronous rate limit check before streaming
   - Redis calls can add latency
   - **Impact**: 10-50ms delay (more with Redis network latency)

3. **Large Context Message Building** (~5-20ms)
   - Lines 560-575: Synchronous string concatenation
   - Very large system prompt (~5000+ tokens)
   - **Impact**: 5-20ms CPU time before streaming

4. **Message Validation** (~5-15ms)
   - Line 479: Processes all messages synchronously
   - Token counting and validation
   - **Impact**: 5-15ms before streaming

### 🟡 Medium Priority Issues

5. **Tool Array Building** (~2-10ms)
   - Lines 511-557: Synchronous tool array construction
   - Multiple conditional checks
   - **Impact**: 2-10ms before streaming

6. **Request Body Parsing** (~2-5ms)
   - Line 477: JSON parsing
   - **Impact**: Minimal but can be optimized

### 🟢 Low Priority (Post-Streaming)

7. **Authentication Check** (~5-20ms)
   - Line 440: Clerk auth check
   - Required for security, but could be optimized

## Current Flow (Before Streaming Starts)

```
1. Auth check (5-20ms)
2. Rate limit check (10-50ms)
3. Parse request body (2-5ms)
4. Validate messages (5-15ms)
5. Parallel DB queries (50-150ms) ⚠️
   - emailAccount
   - githubAccount
   - hasImageEditingSession
6. Sequential DB query (50-150ms) 🔴 BOTTLENECK
   - hasMCPSession
7. Build tools array (2-10ms)
8. Build context message (5-20ms)
9. Format messages (5-10ms)
10. Start streaming
```

**Total Pre-Streaming Time: ~140-440ms**

## Optimization Opportunities

### 1. Combine Database Queries (High Impact)
**Current**: 4 sequential/parallel queries
**Optimized**: 1 parallel batch with all queries

```typescript
// Before: Sequential
const hasMCPSession = await hasActiveSession(userId, "filesystem");

// After: Parallel
const [emailAccount, githubAccount, hasImageEditingSession, hasMCPSession] =
  await Promise.all([
    prisma.emailAccount.findFirst(...),
    prisma.gitHubAccount.findFirst(...),
    hasActiveSession(userId, "image-editing"),
    hasActiveSession(userId, "filesystem"), // Added here
  ]);
```

**Expected Improvement**: 50-150ms reduction

### 2. Defer Rate Limiting Increment (Medium Impact)
**Current**: Check and increment before streaming
**Optimized**: Check before, increment after streaming starts

```typescript
// Check rate limit before streaming
const rateLimitResult = await checkRateLimit(userId, ip);
if (!rateLimitResult.allowed) {
  return new Response("Too Many Requests", { status: 429 });
}

// Start streaming immediately
const stream = new ReadableStream({
  async start(streamController) {
    // Increment rate limit AFTER streaming starts (non-blocking)
    // This doesn't block first token
  }
});
```

**Expected Improvement**: 10-30ms reduction

### 3. Optimize Context Message Building (Medium Impact)
**Current**: Large synchronous string building
**Optimized**: Lazy build or cache common parts

- Cache static parts of system prompt
- Build only dynamic parts per request
- Consider reducing prompt size

**Expected Improvement**: 5-15ms reduction

### 4. Cache User Account Status (High Impact)
**Current**: Database query on every request
**Optimized**: Cache with TTL (5-10 minutes)

```typescript
// Cache user account status
const cacheKey = `user:${userId}:accounts`;
const cached = await redis.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}
// Query DB and cache result
```

**Expected Improvement**: 50-150ms reduction (after cache warmup)

### 5. Start Streaming Earlier (High Impact)
**Current**: All checks complete before streaming
**Optimized**: Start stream, do checks in parallel

```typescript
// Start stream immediately
const stream = new ReadableStream({
  async start(streamController) {
    // Do non-critical checks in parallel with streaming
    const [tools, context] = await Promise.all([
      buildToolsAsync(),
      buildContextAsync(),
    ]);
    // Continue streaming...
  }
});
```

**Expected Improvement**: 100-200ms reduction

### 6. Optimize Message Validation (Low Impact)
**Current**: Full validation before streaming
**Optimized**: Basic validation, full validation async

**Expected Improvement**: 2-5ms reduction

## Recommended Optimizations (Priority Order)

### Phase 1: Quick Wins (1-2 hours)
1. ✅ Combine database queries (parallel batch)
2. ✅ Defer rate limit increment
3. ✅ Optimize context message building

**Expected TTFT Reduction**: 70-200ms

### Phase 2: Caching (2-4 hours)
4. ✅ Cache user account status
5. ✅ Cache MCP session status

**Expected TTFT Reduction**: 50-150ms (after warmup)

### Phase 3: Streaming Optimization (4-8 hours)
6. ✅ Start streaming earlier
7. ✅ Defer non-critical operations

**Expected TTFT Reduction**: 100-200ms

## Target Performance

**Current TTFT**: ~140-440ms
**Target TTFT**: ~50-150ms
**Improvement**: 60-70% reduction

## Measurement

Add timing logs to measure actual improvements:

```typescript
const timings = {
  auth: 0,
  rateLimit: 0,
  dbQueries: 0,
  contextBuild: 0,
  firstToken: 0,
};

const startTime = Date.now();
// ... operations ...
timings.firstToken = Date.now() - startTime;
```

## Implementation Plan

See `CHAT_PERFORMANCE_OPTIMIZATIONS.md` for detailed implementation.

