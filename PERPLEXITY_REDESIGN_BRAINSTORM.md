# Perplexity-Style Web Search Response Redesign - Brainstorming Document

## Overview
This document outlines the approach to redesign web search responses to match Perplexity's format, featuring source cards, categorized sections, inline source tags, and related questions.

## Current Implementation Analysis

### Current Flow
1. **Search API** (`/app/api/search/route.ts`) → Returns JSON with search results
2. **Tool Handler** (`lib/chat/tool-handler.ts`) → Formats results as JSON for LLM
3. **LLM** → Generates markdown text response with links
4. **MessageContent** (`components/chat/message-content.tsx`) → Renders markdown with LinkWithFavicon components

### Current Data Structure
- Search results come as: `{ results: [...], total, count, query }`
- Results include: `title`, `url`, `description`, `meta_url.hostname`, `page_age`
- Formatter categorizes into: `articles`, `youtube_videos`, `podcasts`

### Current UI
- Simple markdown rendering
- Links with favicons
- YouTube video cards
- No source cards, no categorized sections, no inline source tags

## Perplexity Format Analysis

### Key Visual Elements (from reference images)

1. **Source Cards Row** (Top)
   - Horizontal scrollable row
   - Each card shows: thumbnail (optional), source icon/logo, article title, source name
   - Clickable cards that link to articles
   - "+N sources" indicator for overflow

2. **Categorized Sections**
   - Bold section headings (e.g., "Major Product Launches", "Industry Investments")
   - Bullet points under each section
   - Each bullet has inline source tag (small rounded badge with source name)

3. **Inline Source Tags**
   - Small rounded rectangles with light gray background
   - Source name in smaller font
   - Appears after each bullet point

4. **Related Questions Section**
   - Bold "Related" heading
   - List of suggested follow-up questions
   - Each with curved arrow icon

5. **Follow-up Input**
   - Input field at bottom
   - Placeholder: "Ask a follow-up"

## Implementation Approaches

### Approach 1: Structured Data + Custom React Components (RECOMMENDED)

**Concept**: Pass structured search data to frontend, render with custom React components instead of relying on LLM markdown.

**Pros**:
- Full control over UI/UX
- Consistent formatting regardless of LLM output
- Can extract metadata (thumbnails, source info) properly
- Better performance (no markdown parsing)
- Easier to maintain and style

**Cons**:
- Requires changes to message structure
- Need to handle both structured and markdown messages
- More complex implementation

**Implementation Steps**:

1. **Modify Tool Handler** (`lib/chat/tool-handler.ts`)
   - When search tool completes, attach structured data to message metadata
   - Keep LLM response separate but add `searchResults` metadata

2. **Create New Components**:
   ```
   components/search/
   ├── search-response.tsx          # Main container
   ├── source-cards.tsx              # Horizontal scrollable source cards
   ├── source-card.tsx               # Individual source card
   ├── categorized-sections.tsx     # Categorized content sections
   ├── inline-source-tag.tsx        # Small source badge
   ├── related-questions.tsx         # Related questions section
   └── search-result-types.ts        # TypeScript types
   ```

3. **Modify MessageContent** (`components/chat/message-content.tsx`)
   - Check if message has `searchResults` metadata
   - If yes, render `SearchResponse` component instead of markdown
   - If no, render markdown as usual

4. **Update Chat Interface** (`components/chat/chat-interface.tsx`)
   - Pass metadata through to MessageContent
   - Ensure tool results metadata is preserved

5. **LLM Prompt Changes** (`app/api/chat/route.ts`)
   - Update instructions to generate categorized sections
   - Tell LLM to structure response with categories
   - OR: Generate summary text only, let frontend handle formatting

**Data Flow**:
```
Search API → Tool Handler → Attach structured data to metadata
         ↓
LLM receives formatted JSON → Generates categorized response
         ↓
Message with metadata → Frontend detects searchResults
         ↓
SearchResponse component → Renders Perplexity-style UI
```

---

### Approach 2: LLM-Generated Structured Markdown + Parser

**Concept**: Have LLM generate markdown with special annotations, parse and render with custom components.

**Pros**:
- Minimal changes to current flow
- LLM can still generate natural language
- Can parse markdown to extract structure

**Cons**:
- Relies on LLM to format correctly (unreliable)
- Complex markdown parsing
- Less control over exact formatting
- Harder to extract metadata (thumbnails, etc.)

**Implementation**:
- Add special markdown syntax: `[SOURCE:name]` for inline tags
- Add section markers: `## CATEGORY: Section Name`
- Parse markdown to extract structure
- Render with custom components

**Not Recommended** - Too fragile, relies too much on LLM formatting.

---

### Approach 3: Hybrid - Structured Metadata + LLM Summary

**Concept**: Pass structured search data as metadata, LLM generates summary text only.

**Pros**:
- Clean separation: data vs. presentation
- LLM focuses on summarization, not formatting
- Full control over UI rendering

**Cons**:
- Need to categorize results on backend
- May lose some LLM intelligence in categorization

**Implementation**:
1. Backend categorizes results into sections
2. LLM generates summary text for each section
3. Frontend combines structured data + LLM text
4. Render with custom components

**This is a variant of Approach 1** - recommended if we want LLM to generate summaries.

---

## Recommended Implementation: Approach 1 (Structured Data)

### Phase 1: Data Structure & Types

**Create TypeScript Types** (`lib/search/search-result-types.ts`):
```typescript
export interface SearchResultMetadata {
  query: string;
  total: number;
  count: number;
  results: Array<{
    title: string;
    url: string;
    description: string;
    hostname: string;
    thumbnail?: string;
    page_age?: string;
  }>;
  categories?: Array<{
    name: string;
    results: number[]; // Indices into results array
  }>;
}
```

### Phase 2: Backend Changes

**Modify Tool Handler** (`lib/chat/tool-handler.ts`):
- After search completes, create `SearchResultMetadata`
- Attach to message metadata: `metadata.searchResults = searchMetadata`
- Keep LLM response separate

**Option A**: Let LLM generate categorized response
- LLM receives structured JSON
- Generates markdown with categories
- Frontend parses and renders

**Option B**: Backend categorizes, LLM summarizes
- Backend categorizes results (e.g., by domain, topic)
- LLM generates summary text per category
- Frontend renders structured data + LLM summaries

**Recommendation**: Start with Option A (simpler), can evolve to Option B later.

### Phase 3: Frontend Components

**1. Source Cards Component** (`components/search/source-cards.tsx`):
```typescript
interface SourceCardsProps {
  results: SearchResultMetadata['results'];
  maxVisible?: number;
}

// Horizontal scrollable row
// Each card: thumbnail (if available), title, hostname
// Clickable → opens URL
// "+N sources" indicator
```

**2. Categorized Sections Component** (`components/search/categorized-sections.tsx`):
```typescript
interface CategorizedSectionsProps {
  categories: Array<{
    name: string;
    content: string; // LLM-generated text for this category
    sources: number[]; // Result indices
  }>;
  results: SearchResultMetadata['results'];
}

// Renders bold headings + bullet points
// Each bullet has inline source tag
```

**3. Inline Source Tag** (`components/search/inline-source-tag.tsx`):
```typescript
interface InlineSourceTagProps {
  hostname: string;
  url?: string; // Optional - make clickable
}

// Small rounded badge
// Light gray background
// Source name text
```

**4. Related Questions** (`components/search/related-questions.tsx`):
```typescript
interface RelatedQuestionsProps {
  questions: string[]; // Generated by LLM or backend
  onQuestionClick: (question: string) => void;
}

// List of questions with arrow icons
// Clickable → triggers new search
```

**5. Main Container** (`components/search/search-response.tsx`):
```typescript
interface SearchResponseProps {
  metadata: SearchResultMetadata;
  llmContent: string; // LLM-generated markdown/text
}

// Orchestrates all components
// Layout: Source Cards → Categorized Sections → Related Questions
```

### Phase 4: Message Rendering

**Modify MessageContent** (`components/chat/message-content.tsx`):
```typescript
// Check message metadata
if (message.metadata?.searchResults) {
  return <SearchResponse 
    metadata={message.metadata.searchResults}
    llmContent={content}
  />;
}

// Otherwise, render markdown as usual
return <ReactMarkdown>...</ReactMarkdown>;
```

### Phase 5: LLM Prompt Updates

**Update Context Message** (`app/api/chat/route.ts`):
- Add instructions for categorizing search results
- Tell LLM to structure response with clear sections
- Format: "## Category Name\n- Point 1 [source: name]\n- Point 2 [source: name]"
- OR: Generate natural text, backend extracts categories

**Recommendation**: Start simple - let LLM generate natural categorized text, parse it on frontend.

---

## Alternative: Simpler Approach (Quick Win)

### Minimal Changes - Enhanced Markdown Rendering

**Concept**: Keep current flow, enhance markdown rendering to detect and style search results.

**Steps**:
1. Detect search result patterns in markdown
2. Extract source information from links
3. Render source cards above content
4. Style inline source tags
5. Add related questions section

**Pros**:
- Minimal backend changes
- Works with current LLM output
- Can iterate quickly

**Cons**:
- Less control over exact formatting
- Relies on LLM to format correctly
- Harder to extract thumbnails/metadata

**Implementation**:
- Enhance `MessageContent` to detect search result patterns
- Parse markdown links to extract source info
- Render source cards from detected links
- Style inline source tags with CSS

---

## Component Design Details

### Source Card Component
```tsx
<SourceCard
  title="Article Title"
  url="https://example.com/article"
  hostname="example.com"
  thumbnail="https://example.com/thumb.jpg" // Optional
  description="Brief description..."
/>
```

**Styling**:
- Card: rounded corners, hover effect, clickable
- Thumbnail: left side (if available), fallback to favicon
- Title: bold, truncated if too long
- Hostname: smaller text, gray color
- Max width: ~300px

### Inline Source Tag Component
```tsx
<InlineSourceTag hostname="example.com" url="https://example.com" />
```

**Styling**:
- Small rounded rectangle (pill shape)
- Light gray background (`bg-muted`)
- Small font size
- Inline with text
- Optional: clickable to go to source

### Categorized Section Component
```tsx
<CategorizedSection
  title="Major Product Launches"
  items={[
    { text: "Point 1", source: "example.com", url: "..." },
    { text: "Point 2", source: "other.com", url: "..." }
  ]}
/>
```

**Styling**:
- Bold heading (h3 size)
- Bullet points with source tags
- Proper spacing between items

---

## Data Extraction & Categorization

### Option A: LLM Categorizes
- LLM receives all search results
- Generates categorized response
- Frontend parses categories from markdown

**Parsing Strategy**:
- Look for `## Category Name` headings
- Extract bullet points under each heading
- Match sources mentioned in text to results

### Option B: Backend Categorizes
- Backend groups results by domain/topic
- LLM generates summary per category
- Frontend renders structured categories

**Categorization Logic**:
- Group by domain (e.g., all "techcrunch.com" results)
- Group by keywords in title/description
- Use simple heuristics or ML classification

**Recommendation**: Start with Option A (LLM categorizes), can add backend categorization later.

---

## Related Questions Generation

### Option A: LLM Generates
- Add to LLM prompt: "Generate 3-5 related questions"
- LLM includes in response
- Parse and render

### Option B: Backend Generates
- Use query expansion techniques
- Generate variations of original query
- Show as suggestions

**Recommendation**: Start with Option A, can add backend generation later.

---

## Thumbnail Extraction

### Current State
- Brave Search API doesn't return thumbnails for web results
- Only image/news searches have thumbnails

### Solutions

1. **Favicon Fallback**
   - Use favicon service (e.g., `https://www.google.com/s2/favicons?domain=example.com`)
   - Show favicon in source cards

2. **Open Graph Image**
   - Fetch OG image from each URL (backend)
   - Cache thumbnails
   - Show in source cards

3. **No Thumbnails**
   - Just show favicon + title
   - Simpler, faster

**Recommendation**: Start with favicon fallback, can add OG image fetching later.

---

## Implementation Priority

### Phase 1: MVP (Core Features)
1. ✅ Source cards row (horizontal scrollable)
2. ✅ Categorized sections with bold headings
3. ✅ Inline source tags
4. ✅ Basic styling (dark theme)

### Phase 2: Enhancements
1. Related questions section
2. Thumbnail extraction (OG images)
3. Click interactions (cards, tags)
4. Animations/transitions

### Phase 3: Advanced
1. Backend categorization
2. Related questions generation
3. Search result caching/optimization
4. Analytics/tracking

---

## Technical Considerations

### Message Metadata Structure
```typescript
interface Message {
  id: string;
  content: string; // LLM-generated markdown
  role: "assistant" | "user";
  metadata?: {
    searchResults?: SearchResultMetadata;
    toolCalls?: ToolCall[];
    // ... other metadata
  };
}
```

### Backward Compatibility
- Messages without `searchResults` metadata render as before
- No breaking changes to existing messages
- Gradual rollout possible

### Performance
- Source cards: lazy load thumbnails
- Categorization: cache on backend
- Rendering: use React.memo for components

### Accessibility
- Keyboard navigation for source cards
- Screen reader support
- ARIA labels for interactive elements

---

## Questions to Resolve

1. **LLM vs Backend Categorization**?
   - Start with LLM, can add backend later
   - LLM is more flexible, backend is more consistent

2. **Thumbnail Strategy**?
   - Start with favicons, add OG images later
   - Favicons are fast and reliable

3. **Related Questions**?
   - LLM generates vs backend generates
   - Start with LLM, can optimize later

4. **Backward Compatibility**?
   - Yes, check for metadata before rendering
   - Old messages work as before

5. **Styling Approach**?
   - Use Tailwind CSS (already in project)
   - Match Perplexity's dark theme
   - Responsive design for mobile

---

## Next Steps

1. **Review & Approve Approach**
   - Confirm Approach 1 (Structured Data) is preferred
   - Decide on LLM vs backend categorization
   - Confirm thumbnail strategy

2. **Create Component Stubs**
   - Set up component files
   - Define TypeScript types
   - Create basic structure

3. **Implement Phase 1**
   - Source cards component
   - Categorized sections
   - Inline source tags
   - Basic integration

4. **Test & Iterate**
   - Test with real search results
   - Refine styling
   - Add enhancements

---

## Conclusion

**Recommended Approach**: **Approach 1 (Structured Data + Custom React Components)**

This gives us:
- Full control over UI/UX
- Consistent formatting
- Better performance
- Easier maintenance
- Room for future enhancements

**Implementation Strategy**:
- Start with MVP (source cards, categorized sections, inline tags)
- Use LLM for categorization initially
- Use favicons for source cards initially
- Add enhancements iteratively

**Timeline Estimate**:
- Phase 1 (MVP): 2-3 days
- Phase 2 (Enhancements): 1-2 days
- Phase 3 (Advanced): Ongoing

