# Web Search Freshness Audit & Optimization Plan

**Date:** 2025-01-27  
**Issue:** Model producing outdated information during web search  
**Priority:** High

---

## Executive Summary

The current web search implementation has several gaps that cause outdated information to be returned, especially for time-sensitive queries. The LLM is not being instructed to prioritize recent results, freshness parameters are optional rather than default, and caching strategies don't account for breaking news scenarios.

---

## Current Implementation Analysis

### 1. **Search Tool Definitions** (`lib/chat/search-tool-definitions.ts`)

**Current State:**
- `freshness` parameter is **optional** and not defaulted
- Description mentions freshness but doesn't emphasize it for news queries
- No automatic detection of time-sensitive queries

**Issues:**
- ❌ LLM must explicitly choose to use `freshness` parameter
- ❌ No guidance on when to use freshness filters
- ❌ No default freshness for news-related queries

### 2. **System Prompt** (`app/api/chat/route.ts`)

**Current State:**
- Mentions freshness parameter exists
- No explicit instruction to use freshness by default
- No guidance on prioritizing recent results

**Issues:**
- ❌ No instruction: "Always use freshness='pw' or 'pd' for news queries unless user specifies otherwise"
- ❌ No instruction: "Prioritize results with recent publication dates"
- ❌ No instruction: "If results seem outdated, retry with freshness filter"

### 3. **Search Result Formatter** (`lib/search/formatter.ts`)

**Current State:**
- Formats results but doesn't prioritize by date
- Doesn't include publication dates prominently
- Doesn't filter out old results

**Issues:**
- ❌ No date-based sorting (newest first)
- ❌ Publication dates (`page_age`) not included in formatted output
- ❌ No filtering of results older than a threshold
- ❌ No warning when results are stale

### 4. **Caching Strategy** (`lib/search/cache.ts`)

**Current State:**
- General queries: 1 hour cache
- Time-sensitive queries (pd/pw): 5 minutes cache
- Cache key includes freshness parameter

**Issues:**
- ⚠️ 5 minutes may be too long for breaking news
- ⚠️ No cache invalidation for very recent queries
- ⚠️ Cache doesn't distinguish between "news" and "general" queries automatically

### 5. **Search API Route** (`app/api/search/route.ts`)

**Current State:**
- Accepts freshness parameter
- Validates freshness values
- No automatic freshness injection

**Issues:**
- ❌ No automatic freshness detection based on query intent
- ❌ No freshness parameter injection for news-related queries

---

## Root Causes

1. **LLM Not Instructed to Use Freshness by Default**
   - Freshness is optional, so LLM often omits it
   - No clear guidance on when freshness is critical
   - No fallback mechanism if results seem outdated

2. **No Date-Based Result Prioritization**
   - Results returned in API order, not sorted by recency
   - Publication dates not prominently displayed
   - No filtering of stale content

3. **Cache Too Aggressive for News**
   - 5-minute cache for time-sensitive queries still allows stale results
   - No mechanism to bypass cache for "latest" queries
   - Cache doesn't account for query intent

4. **No Query Intent Detection**
   - System doesn't detect news/time-sensitive queries automatically
   - No automatic freshness parameter injection
   - Relies entirely on LLM to make correct choice

---

## Required Optimizations

### Priority 1: Critical (Immediate)

#### 1.1 Update System Prompt - Default Freshness for News
**File:** `app/api/chat/route.ts`

**Changes:**
- Add explicit instruction: "ALWAYS use freshness='pw' (past week) for news queries unless user specifies a different time period"
- Add instruction: "For queries about 'latest', 'recent', 'current', 'today', 'breaking', or 'news' → use freshness='pd' (past day)"
- Add instruction: "Prioritize results with recent publication dates in your response"
- Add instruction: "If search results don't include dates or seem outdated, mention this to the user"

**Impact:** High - Ensures LLM uses freshness filters appropriately

#### 1.2 Enhance Search Result Formatter - Include Dates & Sort
**File:** `lib/search/formatter.ts`

**Changes:**
- Include `page_age` (publication date) in formatted results
- Sort results by date (newest first) when dates are available
- Add date information to each result item
- Filter out results older than 1 year unless explicitly requested

**Impact:** High - Users see when content was published

#### 1.3 Reduce Cache TTL for News Queries
**File:** `lib/search/cache.ts`

**Changes:**
- Reduce `CACHE_TTL_TIME_SENSITIVE` from 5 minutes to 2 minutes for `freshness='pd'`
- Add separate TTL for `freshness='pw'` (5 minutes)
- Add cache bypass mechanism for queries containing "latest", "breaking", "today"

**Impact:** Medium - Reduces stale results but may increase API calls

### Priority 2: Important (Short-term)

#### 2.1 Query Intent Detection
**File:** `app/api/search/route.ts` or new `lib/search/query-analyzer.ts`

**Changes:**
- Create function to detect time-sensitive query intent
- Automatically inject `freshness='pd'` for breaking news keywords
- Automatically inject `freshness='pw'` for general news queries
- Allow LLM override if it explicitly sets freshness

**Keywords to detect:**
- Breaking news: "breaking", "latest", "just", "today", "now", "recent"
- News queries: "news", "update", "announcement", "report"
- Time-sensitive: "current", "recent", "new", "2024", "2025"

**Impact:** High - Automatic freshness without relying on LLM

#### 2.2 Enhanced Tool Description
**File:** `lib/chat/search-tool-definitions.ts`

**Changes:**
- Update `web_search` description to emphasize freshness for news
- Update `web_search_news` to default to `freshness='pd'`
- Add examples showing freshness usage

**Impact:** Medium - Better LLM understanding

#### 2.3 Date Display in Results
**File:** `lib/search/formatter.ts`

**Changes:**
- Format `page_age` into human-readable dates
- Add "Published: X days ago" to each result
- Highlight very recent results (< 24 hours)
- Warn if all results are older than 1 week

**Impact:** Medium - Better user awareness

### Priority 3: Enhancement (Medium-term)

#### 3.1 Result Quality Scoring
**File:** `lib/search/formatter.ts`

**Changes:**
- Score results based on recency + relevance
- Boost recent results in ranking
- Deprioritize results older than threshold

**Impact:** Low-Medium - Better result ordering

#### 3.2 Cache Invalidation Strategy
**File:** `lib/search/cache.ts`

**Changes:**
- Implement cache warming for popular queries
- Add cache invalidation on demand
- Track cache hit rates for optimization

**Impact:** Low - Performance optimization

#### 3.3 Search Result Validation
**File:** `lib/search/formatter.ts`

**Changes:**
- Validate that results match freshness criteria
- Filter out results that don't meet freshness requirements
- Log warnings when API returns stale results

**Impact:** Low - Quality assurance

---

## Implementation Plan

### Phase 1: Immediate Fixes (Week 1)

1. ✅ Update system prompt with freshness instructions
2. ✅ Enhance formatter to include dates and sort by recency
3. ✅ Reduce cache TTL for time-sensitive queries
4. ✅ Add date information to formatted results

### Phase 2: Automatic Detection (Week 2)

1. ✅ Implement query intent detection
2. ✅ Auto-inject freshness parameter for news queries
3. ✅ Update tool descriptions with examples
4. ✅ Add date formatting and warnings

### Phase 3: Quality Improvements (Week 3)

1. ⏳ Implement result quality scoring
2. ⏳ Add cache invalidation mechanisms
3. ⏳ Add result validation and filtering
4. ⏳ Monitor and optimize cache hit rates

---

## Expected Outcomes

### Before Optimization:
- ❌ LLM often omits freshness parameter
- ❌ Results may be weeks or months old
- ❌ No date information shown to users
- ❌ Cache serves stale results for up to 5 minutes

### After Optimization:
- ✅ LLM automatically uses freshness for news queries
- ✅ Results prioritized by recency
- ✅ Publication dates prominently displayed
- ✅ Cache reduced to 2 minutes for breaking news
- ✅ Automatic freshness injection for time-sensitive queries
- ✅ Users aware when content is outdated

---

## Testing Checklist

- [ ] Test news query without explicit freshness → should use 'pd' or 'pw'
- [ ] Test breaking news query → should use 'pd' and bypass cache
- [ ] Test general query → should not force freshness
- [ ] Test results include publication dates
- [ ] Test results sorted by date (newest first)
- [ ] Test cache TTL is reduced for time-sensitive queries
- [ ] Test query intent detection works correctly
- [ ] Test LLM can override automatic freshness if needed

---

## Metrics to Track

1. **Freshness Parameter Usage Rate**
   - Percentage of queries using freshness parameter
   - Target: >80% for news-related queries

2. **Result Recency**
   - Average age of results returned
   - Target: <7 days for news queries

3. **Cache Hit Rate**
   - Percentage of queries served from cache
   - Monitor impact of reduced TTL

4. **User Satisfaction**
   - Feedback on result freshness
   - Track complaints about outdated information

---

## Risk Assessment

### Low Risk:
- Updating system prompts
- Adding date information to results
- Reducing cache TTL

### Medium Risk:
- Query intent detection (may incorrectly classify queries)
- Automatic freshness injection (may conflict with user intent)

### Mitigation:
- Make automatic detection conservative (only for obvious news queries)
- Allow LLM to override automatic freshness
- Monitor false positives and adjust keywords

---

## Conclusion

The primary issue is that the LLM is not being instructed to prioritize recent results and use freshness parameters by default. Combined with lack of date information in results and aggressive caching, users receive outdated information.

**Key Actions:**
1. Update system prompt to enforce freshness for news queries
2. Add date information and sorting to search results
3. Implement query intent detection for automatic freshness
4. Reduce cache TTL for time-sensitive queries

These changes will ensure users receive the latest information unless they explicitly request historical content.

