# Web Search Implementation Plan - Brave Search API Integration

## Executive Summary

This document provides a comprehensive audit and implementation plan for integrating Brave Search API (Pro) into OperaStudio. The implementation will follow the existing tool architecture pattern used for Email, GitHub, and Imagen integrations.

## Current State Audit

### ✅ Existing Architecture Patterns

1. **Tool Definition Pattern**
   - Tools defined in separate files (`lib/chat/*-tool-definitions.ts`)
   - Tools registered conditionally in `/app/api/chat/route.ts`
   - Tools passed to Gemini via `getGeminiToolDefinitions()`

2. **API Route Pattern**
   - API routes in `/app/api/{feature}/` directory
   - Consistent error handling and response formatting
   - Authentication via Clerk (`@clerk/nextjs/server`)

3. **Tool Handler Pattern**
   - Tool execution in `lib/chat/tool-handler.ts`
   - Routes tools to appropriate API endpoints
   - Handles timeouts, errors, and retries

4. **Context Awareness**
   - Context messages built in `buildContextMessage()` function
   - Tool availability based on active sessions/accounts
   - Cross-context operations supported

### ❌ Missing Components

1. **Web Search Tool Definitions** - Not yet created
2. **Web Search API Route** - Not yet created
3. **Web Search Tool Handler** - Not yet implemented
4. **Environment Configuration** - Brave API key not configured
5. **Rate Limiting** - No search-specific rate limiting
6. **Caching Layer** - No search result caching

## Implementation Plan

### Phase 1: Core Infrastructure (Foundation)

#### 1.1 Environment Configuration
- [ ] Add `BRAVE_SEARCH_API_KEY` to environment variables
- [ ] Create environment validation in `env.config` or similar
- [ ] Document API key setup in README

#### 1.2 API Route Implementation
**File:** `/app/api/search/route.ts`

**Features:**
- Basic web search endpoint (`POST /api/search`)
- Query parameter validation
- Brave Search API integration
- Error handling and rate limit detection
- Response formatting

**API Endpoint Structure:**
```typescript
POST /api/search
Body: {
  query: string;           // Required: Search query
  count?: number;          // Optional: Results count (1-20, default: 10)
  offset?: number;         // Optional: Pagination offset
  safesearch?: string;     // Optional: "strict", "moderate", "off"
  freshness?: string;      // Optional: "pd" (past day), "pw" (past week), "pm" (past month), "py" (past year)
  country?: string;       // Optional: ISO 3166-1 alpha-2 country code
  search_lang?: string;    // Optional: ISO 639-1 language code
  ui_lang?: string;        // Optional: UI language
  text_decorations?: boolean; // Optional: Include HTML formatting
  spellcheck?: boolean;    // Optional: Spell check query
}
```

#### 1.3 Tool Definition
**File:** `/lib/chat/search-tool-definitions.ts`

**Tool:** `web_search`
- Description: Search the web using Brave Search API
- Parameters: query (required), count, offset, safesearch, freshness, country, search_lang
- Returns: Search results with titles, URLs, descriptions, and metadata

### Phase 2: Integration (Core Functionality)

#### 2.1 Tool Handler Integration
**File:** `lib/chat/tool-handler.ts`

- [ ] Add `executeSearchToolCall()` function
- [ ] Route `web_search` tool calls to `/api/search`
- [ ] Handle timeouts (30-60 seconds)
- [ ] Format results for LLM consumption

#### 2.2 Chat Route Integration
**File:** `/app/api/chat/route.ts`

- [ ] Import `SEARCH_TOOLS` from tool definitions
- [ ] Add search tools to `availableTools` array (always available - no account needed)
- [ ] Update `buildContextMessage()` to include search context
- [ ] Add search tool availability check (always true)

### Phase 3: Enhancement Features

#### 3.1 Result Caching
**Purpose:** Reduce API calls and improve response times

**Implementation:**
- Use Redis (already available via `@upstash/redis`) for caching
- Cache key: `search:${normalizedQuery}:${paramsHash}`
- TTL: 1 hour for general queries, 5 minutes for time-sensitive queries
- Cache invalidation on explicit refresh requests

**File:** `/lib/search/cache.ts`

#### 3.2 Rate Limiting
**Purpose:** Prevent API quota exhaustion

**Implementation:**
- Track search requests per user
- Use existing rate limit infrastructure (`lib/rateLimit.ts`)
- Limits: 100 searches/hour per user (configurable)
- Graceful degradation with informative error messages

#### 3.3 Search Result Formatting
**Purpose:** Optimize results for LLM consumption

**Features:**
- Extract key information (title, URL, snippet)
- Summarize long descriptions
- Highlight relevant excerpts
- Include metadata (date, source type, etc.)

**File:** `/lib/search/formatter.ts`

#### 3.4 Advanced Search Features

**3.4.1 Image Search**
- Tool: `web_search_images`
- Endpoint: `/api/search/images`
- Returns: Image URLs, thumbnails, source pages

**3.4.2 News Search**
- Tool: `web_search_news`
- Endpoint: `/api/search/news`
- Filters: Date range, source, category
- Returns: News articles with timestamps

**3.4.3 Video Search**
- Tool: `web_search_videos`
- Endpoint: `/api/search/videos`
- Returns: Video URLs, thumbnails, duration, source

**3.4.4 Autocomplete/Suggestions**
- Endpoint: `/api/search/suggestions`
- Real-time query suggestions
- Can be used for UI enhancement (future)

### Phase 4: UX Enhancements

#### 4.1 Search Context Integration
- Add search history tracking
- Show recent searches in context
- Suggest related searches

#### 4.2 Result Presentation
- Format search results in chat interface
- Clickable links
- Source attribution
- Rich snippets when available

#### 4.3 Search Analytics
- Track popular queries
- Monitor API usage
- Identify optimization opportunities

## Technical Specifications

### Brave Search API Details

**Base URL:** `https://api.search.brave.com/res/v1/web/search`

**Authentication:**
- Header: `X-Subscription-Token: {BRAVE_SEARCH_API_KEY}`
- Method: GET or POST

**Rate Limits (Pro Plan):**
- Requests per month: Based on plan tier
- Requests per second: Typically 10-20 (check current limits)
- Response time: ~200-500ms average

**Response Format:**
```json
{
  "query": {
    "original": "search query",
    "show_strict_warning": false,
    "is_navigational": false,
    "is_news_breaking": false,
    "altered": {
      "query": "altered query",
      "skipped_alter": false
    }
  },
  "web": {
    "results": [
      {
        "title": "Result Title",
        "url": "https://example.com/page",
        "description": "Result description...",
        "page_age": "2024-01-01T00:00:00Z",
        "language": "en",
        "family_friendly": true,
        "type": "web",
        "subtype": "organic",
        "meta_url": {
          "hostname": "example.com",
          "path": "/page",
          "scheme": "https"
        },
        "age": "2024-01-01T00:00:00Z"
      }
    ],
    "count": 10,
    "total": 1000000
  }
}
```

### Error Handling

**Common Errors:**
- `400 Bad Request`: Invalid query or parameters
- `401 Unauthorized`: Invalid or missing API key
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Brave API error
- `503 Service Unavailable`: Brave API temporarily unavailable

**Handling Strategy:**
- Retry with exponential backoff for 5xx errors
- Return user-friendly error messages
- Log errors for monitoring
- Graceful degradation (suggest alternative actions)

### Security Considerations

1. **API Key Protection**
   - Store in environment variables only
   - Never expose in client-side code
   - Rotate keys periodically

2. **Input Validation**
   - Sanitize search queries
   - Validate parameters
   - Prevent injection attacks

3. **Rate Limiting**
   - Per-user limits
   - Per-IP limits (optional)
   - Quota monitoring

4. **Privacy**
   - Don't log sensitive queries
   - Clear search history option
   - GDPR compliance considerations

## File Structure

```
operastudio-11.0/
├── app/
│   └── api/
│       └── search/
│           ├── route.ts              # Main search endpoint
│           ├── images/
│           │   └── route.ts          # Image search endpoint
│           ├── news/
│           │   └── route.ts          # News search endpoint
│           └── suggestions/
│               └── route.ts          # Autocomplete endpoint
├── lib/
│   ├── chat/
│   │   ├── search-tool-definitions.ts  # Tool definitions
│   │   └── tool-handler.ts            # Updated with search handler
│   └── search/
│       ├── client.ts                  # Brave API client
│       ├── cache.ts                   # Caching layer
│       ├── formatter.ts               # Result formatting
│       └── types.ts                   # TypeScript types
└── .env.local                         # Add BRAVE_SEARCH_API_KEY
```

## Implementation Checklist

### Core Implementation
- [ ] Create `/lib/chat/search-tool-definitions.ts`
- [ ] Create `/app/api/search/route.ts`
- [ ] Create `/lib/search/client.ts` (Brave API wrapper)
- [ ] Create `/lib/search/types.ts` (TypeScript types)
- [ ] Update `/lib/chat/tool-handler.ts` with search handler
- [ ] Update `/app/api/chat/route.ts` to include search tools
- [ ] Add environment variable configuration
- [ ] Add error handling and validation

### Enhancement Features
- [ ] Implement result caching (`/lib/search/cache.ts`)
- [ ] Add rate limiting for search
- [ ] Create result formatter (`/lib/search/formatter.ts`)
- [ ] Add image search endpoint
- [ ] Add news search endpoint
- [ ] Add video search endpoint (if supported)

### Testing & Documentation
- [ ] Write unit tests for search client
- [ ] Write integration tests for API route
- [ ] Test error scenarios
- [ ] Test rate limiting
- [ ] Update README with setup instructions
- [ ] Document API usage in code comments

## Enhancement Suggestions

### 1. Intelligent Query Enhancement
**Description:** Pre-process queries to improve search quality

**Features:**
- Query expansion (synonyms, related terms)
- Spell correction
- Intent detection (informational, navigational, transactional)
- Query rewriting based on context

**Implementation:**
- Use LLM to enhance queries before searching
- Cache enhanced queries
- Learn from user feedback

### 2. Result Summarization
**Description:** Use LLM to summarize search results

**Features:**
- Multi-result summarization
- Key point extraction
- Source synthesis
- Answer extraction (for factual queries)

**Implementation:**
- Pass top N results to LLM
- Generate concise summary
- Include source citations
- Cache summaries

### 3. Contextual Search
**Description:** Use conversation context to improve searches

**Features:**
- Extract entities from conversation
- Add context to queries
- Filter results by relevance to conversation
- Track search history per conversation

**Implementation:**
- Analyze recent messages for context
- Build enhanced queries with context
- Score results by context relevance

### 4. Search Result Actions
**Description:** Enable actions on search results

**Features:**
- "Read more" - Fetch full page content
- "Summarize" - Generate summary of page
- "Extract key points" - Extract main points
- "Save to notes" - Save result for later

**Implementation:**
- Add action tools (`web_search_read`, `web_search_summarize`)
- Integrate with file system tools for saving
- Use web scraping for content extraction

### 5. Multi-Source Search
**Description:** Combine multiple search sources

**Features:**
- Search web + GitHub repositories
- Search web + local files
- Aggregate results from multiple sources
- Deduplicate and rank results

**Implementation:**
- Parallel search across sources
- Unified result format
- Cross-source ranking algorithm

### 6. Search Analytics Dashboard
**Description:** Monitor and optimize search usage

**Features:**
- Query frequency analysis
- API usage tracking
- Popular queries report
- Cost optimization suggestions

**Implementation:**
- Store search queries (anonymized)
- Generate analytics reports
- Alert on unusual usage patterns

### 7. Search History & Bookmarks
**Description:** Remember and organize searches

**Features:**
- Search history per user
- Bookmark useful results
- Organize bookmarks into collections
- Share search results

**Implementation:**
- Database schema for search history
- UI for managing bookmarks
- Export functionality

### 8. Real-Time Search Suggestions
**Description:** Provide search suggestions as user types

**Features:**
- Autocomplete suggestions
- Related searches
- Trending searches
- Recent searches

**Implementation:**
- Use Brave Suggestions API (if available)
- Cache popular queries
- Client-side UI component

### 9. Advanced Filtering
**Description:** Filter results by various criteria

**Features:**
- Date range filtering
- Domain filtering (include/exclude)
- Content type filtering (articles, forums, etc.)
- Language filtering
- Safe search controls

**Implementation:**
- Add filter parameters to search tool
- UI for filter selection
- Persist user preferences

### 10. Search Result Clustering
**Description:** Group similar results together

**Features:**
- Cluster by topic
- Cluster by source type
- Cluster by date
- Show cluster summaries

**Implementation:**
- Use LLM or ML for clustering
- Generate cluster labels
- Present clustered results

## Performance Optimization

### Caching Strategy
- **Query-level caching:** Cache full search results for 1 hour
- **Result-level caching:** Cache individual result pages for 24 hours
- **Popular queries:** Extended cache (6 hours) for frequent queries
- **Cache invalidation:** On-demand refresh option

### Request Optimization
- **Batch requests:** Combine multiple searches when possible
- **Pagination:** Efficient pagination with offset/limit
- **Lazy loading:** Load additional results on demand
- **Prefetching:** Prefetch likely next queries

### Response Optimization
- **Result limiting:** Return only necessary fields
- **Compression:** Compress large responses
- **Streaming:** Stream results for long queries (future)

## Monitoring & Observability

### Metrics to Track
- Search request count per user
- API response times
- Error rates
- Cache hit rates
- Most popular queries
- API quota usage

### Logging
- Log all search queries (sanitized)
- Log API errors with context
- Log performance metrics
- Log rate limit hits

### Alerts
- API quota approaching limit
- High error rate
- Unusual usage patterns
- Performance degradation

## Cost Optimization

### API Usage Optimization
- **Caching:** Reduce redundant API calls
- **Query optimization:** Improve query quality to reduce re-searches
- **Result limiting:** Request only needed results
- **Batch processing:** Combine related searches

### Cost Monitoring
- Track API usage per user
- Set usage alerts
- Implement usage caps (optional)
- Generate cost reports

## Testing Strategy

### Unit Tests
- Search client functions
- Result formatting
- Cache operations
- Error handling

### Integration Tests
- API route endpoints
- Tool handler integration
- End-to-end search flow
- Error scenarios

### Performance Tests
- Response time benchmarks
- Concurrent request handling
- Cache effectiveness
- Rate limit behavior

## Rollout Plan

### Phase 1: MVP (Week 1)
- Basic web search functionality
- Single search tool
- Error handling
- Basic caching

### Phase 2: Enhancements (Week 2)
- Result formatting improvements
- Rate limiting
- Enhanced error messages
- Documentation

### Phase 3: Advanced Features (Week 3-4)
- Image/news/video search
- Result summarization
- Search history
- Analytics

### Phase 4: Optimization (Ongoing)
- Performance tuning
- Cost optimization
- User feedback integration
- Feature refinement

## Success Metrics

### Technical Metrics
- API response time < 500ms (p95)
- Cache hit rate > 60%
- Error rate < 1%
- Uptime > 99.9%

### User Metrics
- Search usage frequency
- User satisfaction
- Query success rate
- Feature adoption

### Business Metrics
- API cost per search
- Cost per active user
- Search-to-action conversion
- User retention impact

## Risk Assessment

### Technical Risks
- **API rate limits:** Mitigated by caching and rate limiting
- **API downtime:** Mitigated by error handling and retries
- **Cost overruns:** Mitigated by usage monitoring and caps

### Security Risks
- **API key exposure:** Mitigated by environment variables
- **Query injection:** Mitigated by input validation
- **Privacy concerns:** Mitigated by data handling policies

## Future Considerations

### Potential Integrations
- Integration with file system tools (save search results)
- Integration with email tools (email search results)
- Integration with GitHub tools (search code repositories)
- Integration with image tools (search and generate)

### Scalability
- Consider search result database for large-scale caching
- Implement search result indexing for faster retrieval
- Explore distributed caching for multi-region deployment

### Advanced Features
- Natural language query understanding
- Multi-modal search (text + image)
- Voice search integration
- Search result visualization

## Conclusion

This implementation plan provides a comprehensive roadmap for integrating Brave Search API into OperaStudio. The phased approach ensures a solid foundation while allowing for iterative enhancements based on user feedback and usage patterns.

The architecture follows existing patterns in the codebase, ensuring consistency and maintainability. The enhancement suggestions provide opportunities for differentiation and improved user experience.

**Next Steps:**
1. Review and approve this plan
2. Set up Brave Search API key
3. Begin Phase 1 implementation
4. Iterate based on feedback

