# Brave Search API Quick Reference

## API Overview

**Base URL:** `https://api.search.brave.com/res/v1/web/search`

**Authentication:** Header-based
```
X-Subscription-Token: {BRAVE_SEARCH_API_KEY}
```

**Method:** GET or POST

**Rate Limits (Pro Plan):**
- Check your dashboard for current limits
- Typical: 10-20 requests/second
- Monthly quota based on plan tier

## Request Parameters

### Required Parameters
- `q` (string): Search query

### Optional Parameters
- `count` (number): Number of results (1-20, default: 10)
- `offset` (number): Pagination offset (default: 0)
- `safesearch` (string): "strict" | "moderate" | "off" (default: "moderate")
- `freshness` (string): "pd" | "pw" | "pm" | "py" (past day/week/month/year)
- `country` (string): ISO 3166-1 alpha-2 country code (e.g., "US", "GB")
- `search_lang` (string): ISO 639-1 language code (e.g., "en", "es")
- `ui_lang` (string): UI language code
- `text_decorations` (boolean): Include HTML formatting (default: false)
- `spellcheck` (boolean): Spell check query (default: true)

## Response Format

```typescript
{
  query: {
    original: string;
    show_strict_warning: boolean;
    is_navigational: boolean;
    is_news_breaking: boolean;
    altered?: {
      query: string;
      skipped_alter: boolean;
    };
  };
  web: {
    results: Array<{
      title: string;
      url: string;
      description: string;
      page_age?: string;
      language?: string;
      family_friendly: boolean;
      type: string;
      subtype: string;
      meta_url: {
        hostname: string;
        path: string;
        scheme: string;
      };
      age?: string;
    }>;
    count: number;
    total: number;
  };
}
```

## Example Request

```typescript
const response = await fetch('https://api.search.brave.com/res/v1/web/search', {
  method: 'GET',
  headers: {
    'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY!,
  },
  params: new URLSearchParams({
    q: 'TypeScript best practices',
    count: '10',
    safesearch: 'moderate',
    country: 'US',
    search_lang: 'en',
  }),
});
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid query parameter"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid API key"
}
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 60
}
```

### 500/503 Server Error
```json
{
  "error": "Internal server error"
}
```

## Implementation Example

```typescript
// lib/search/client.ts
import { BRAVE_SEARCH_API_KEY } from '@/lib/env';

export interface BraveSearchParams {
  q: string;
  count?: number;
  offset?: number;
  safesearch?: 'strict' | 'moderate' | 'off';
  freshness?: 'pd' | 'pw' | 'pm' | 'py';
  country?: string;
  search_lang?: string;
}

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  page_age?: string;
  language?: string;
  meta_url: {
    hostname: string;
    path: string;
  };
}

export async function searchBrave(params: BraveSearchParams): Promise<{
  results: BraveSearchResult[];
  total: number;
  count: number;
}> {
  const searchParams = new URLSearchParams({
    q: params.q,
    ...(params.count && { count: String(params.count) }),
    ...(params.offset && { offset: String(params.offset) }),
    ...(params.safesearch && { safesearch: params.safesearch }),
    ...(params.freshness && { freshness: params.freshness }),
    ...(params.country && { country: params.country }),
    ...(params.search_lang && { search_lang: params.search_lang }),
  });

  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${searchParams}`,
    {
      headers: {
        'X-Subscription-Token': BRAVE_SEARCH_API_KEY,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 401) {
      throw new Error('Invalid API key');
    }
    throw new Error(`Search failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  return {
    results: data.web?.results || [],
    total: data.web?.total || 0,
    count: data.web?.count || 0,
  };
}
```

## Best Practices

### 1. Error Handling
- Always check response status
- Handle rate limits gracefully with retry logic
- Log errors for monitoring

### 2. Caching
- Cache results for 1 hour (general queries)
- Cache for 5 minutes (time-sensitive queries)
- Use query + params as cache key

### 3. Rate Limiting
- Implement per-user rate limits
- Monitor API usage
- Set usage alerts

### 4. Query Optimization
- Sanitize user queries
- Validate parameters
- Limit result count appropriately

### 5. Performance
- Use appropriate timeout values (30-60 seconds)
- Implement request cancellation
- Monitor response times

## Additional Endpoints

### Image Search
**Endpoint:** `https://api.search.brave.com/res/v1/images/search`
**Parameters:** Same as web search
**Response:** Similar structure with image-specific fields

### News Search
**Endpoint:** `https://api.search.brave.com/res/v1/news/search`
**Parameters:** Same as web search + date filters
**Response:** News articles with timestamps

### Video Search
**Endpoint:** `https://api.search.brave.com/res/v1/videos/search`
**Parameters:** Same as web search
**Response:** Videos with thumbnails and duration

### Suggestions (Autocomplete)
**Endpoint:** `https://api.search.brave.com/res/v1/suggest/search`
**Parameters:** `q` (query string)
**Response:** Array of suggestion strings

## Environment Setup

Add to `env.config`:
```bash
BRAVE_SEARCH_API_KEY=your_api_key_here
```

Access in code:
```typescript
const apiKey = process.env.BRAVE_SEARCH_API_KEY;
if (!apiKey) {
  throw new Error('BRAVE_SEARCH_API_KEY is not configured');
}
```

## Monitoring

### Key Metrics to Track
- Request count per user
- Response times (p50, p95, p99)
- Error rates
- Cache hit rates
- API quota usage

### Dashboard
- Access your dashboard at: https://api-dashboard.search.brave.com
- Monitor usage, quotas, and performance
- Set up alerts for quota limits

## Support & Documentation

- **Official Docs:** https://brave.com/search/api
- **API Dashboard:** https://api-dashboard.search.brave.com
- **Support:** Check dashboard for support contact

## Notes

- API responses are typically 200-500ms
- Results are ranked by relevance
- Safe search is enabled by default
- Results include metadata for filtering/display
- API supports pagination via offset parameter

