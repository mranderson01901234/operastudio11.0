# Web Search Answer View - Optimized Implementation Prompt

## Executive Summary

Transform the existing web search response renderer to precisely match Perplexity's "Answer" view shown in the reference screenshot. This is a **refinement** of existing components, not a complete rewrite.

---

## 🎯 Goal

Create a 1:1 visual match of Perplexity's Answer layout with these elements:
1. **Query title** - Large, sentence case
2. **Tab navigation** - Answer/Images (Answer active by default)
3. **Horizontal source chips** - Scrollable row with favicon + publisher cards
4. **Steps caption** - Muted "Assistant steps" text
5. **Sectioned content** - H2 headings with bullet lists, inline source badges
6. **Follow-up bar** - Input with quick-action icons

**Visual Requirements:**
- Dark theme, high contrast
- Monochrome zinc palette (no green)
- Clean, modern spacing
- Matches reference screenshot structure exactly

---

## 🏗️ Architecture Context

### Existing Implementation
```
components/search/
├── search-response.tsx          # Main orchestrator
├── source-cards.tsx             # Horizontal source cards
├── categorized-sections.tsx     # Sections with bullets
├── inline-source-tag.tsx        # Small source badges
├── source-card.tsx              # Individual source card
└── related-questions.tsx        # Follow-up questions
```

### What We're Building
```
components/search/
├── search-answer.tsx            # NEW: Full Answer view wrapper
├── answer-header.tsx            # NEW: Query title + tabs
├── source-chips.tsx             # REFACTOR: Smaller, denser chips
├── answer-sections.tsx          # REFACTOR: Optimized sections
├── inline-source-badge.tsx      # REFACTOR: Smaller badges
└── follow-up-bar.tsx            # NEW: Input + actions
```

**Note:** We're refactoring existing components, not replacing data flow. Brave Search + MCP integration stays unchanged.

---

## 📊 Data Contract

### Input Type
```typescript
export interface SearchAnswerPayload {
  // Core data
  query: string;                    // Original user query
  mode: "answer" | "images";        // Tab state
  
  // Sources
  sources: Array<{
    url: string;
    title: string;                  // Publisher/domain name
    favicon?: string;               // 16-32px icon (data URL or external)
    tag?: string;                   // Optional: "news", "doc", "forum"
    description?: string;           // Optional: Used for card expansion
  }>;
  
  // Content sections
  sections: Array<{
    heading: string;                // e.g., "Major Product Launches"
    bullets: Array<{
      text: string;                 // Plain text or simple HTML (bold, italic, code)
      sourceIndex?: number;         // Index into sources[] for citation
    }>;
  }>;
  
  // Metadata
  stepsCaption?: string;            // Default: "Assistant steps"
  followups?: string[];             // Suggested follow-up queries
}
```

### Data Normalization Point
**Where to normalize:** In the chat message renderer, before passing to `<SearchAnswer>`.

**From existing:** Transform `SearchResultMetadata` → `SearchAnswerPayload`:
```typescript
function normalizeToAnswerPayload(
  metadata: SearchResultMetadata,
  llmContent: string
): SearchAnswerPayload {
  return {
    query: metadata.query,
    mode: "answer",
    sources: metadata.results.map(r => ({
      url: r.url,
      title: r.hostname.replace(/^www\./, ""),
      favicon: extractFavicon(r.url),
      description: r.description,
    })),
    sections: parseSectionsFromMarkdown(llmContent),
    followups: metadata.relatedQuestions,
  };
}
```

---

## 🎨 Component Specifications

### 1. `SearchAnswer.tsx` (Main Wrapper)

**Purpose:** Orchestrates all sub-components, handles tab state.

```typescript
interface SearchAnswerProps {
  payload: SearchAnswerPayload;
  onFollowUpSubmit?: (query: string) => void;
}

export function SearchAnswer({ payload, onFollowUpSubmit }: SearchAnswerProps) {
  const [activeTab, setActiveTab] = useState<"answer" | "images">(payload.mode);
  
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      {/* Header: Title + Tabs */}
      <AnswerHeader 
        query={payload.query} 
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      
      {/* Tab Content */}
      {activeTab === "answer" ? (
        <>
          {/* Source Chips */}
          <SourceChips sources={payload.sources} />
          
          {/* Steps Caption */}
          <p className="text-xs text-zinc-500 mb-4">
            {payload.stepsCaption || "Assistant steps"}
          </p>
          
          {/* Answer Sections */}
          <AnswerSections 
            sections={payload.sections}
            sources={payload.sources}
          />
          
          {/* Follow-up Bar */}
          <FollowUpBar 
            suggestions={payload.followups}
            onSubmit={onFollowUpSubmit}
          />
        </>
      ) : (
        <ImageGrid query={payload.query} /> // Existing image grid
      )}
    </div>
  );
}
```

**Key Details:**
- Container: `max-w-3xl mx-auto` for optimal reading width
- Spacing: `space-y-4` between major sections
- Tab state: Managed locally, can be overridden via prop

---

### 2. `AnswerHeader.tsx` (Query Title + Tabs)

**Purpose:** Display query prominently, provide tab navigation.

```typescript
interface AnswerHeaderProps {
  query: string;
  activeTab: "answer" | "images";
  onTabChange: (tab: "answer" | "images") => void;
}

export function AnswerHeader({ query, activeTab, onTabChange }: AnswerHeaderProps) {
  return (
    <div className="space-y-3">
      {/* Query Title */}
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
        {toSentenceCase(query)}
      </h1>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="bg-zinc-900/50 border-zinc-800">
          <TabsTrigger value="answer">Answer</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
```

**Styling:**
- Title: Large (text-2xl), high contrast (zinc-100)
- Tabs: Use shadcn `Tabs` with dark theme
- Spacing: Tight (space-y-3)

**Utility Function:**
```typescript
// lib/utils/strings.ts
export function toSentenceCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
```

---

### 3. `SourceChips.tsx` (Compact Source Cards)

**Purpose:** Replace existing `SourceCards` with smaller, denser chips.

**Key Differences from Current:**
- **Size:** Smaller (h-12 vs h-14), more compact
- **Layout:** Tighter spacing, subtle borders
- **Interaction:** Click to open URL, hover effect

```typescript
interface SourceChipsProps {
  sources: SearchAnswerPayload["sources"];
  maxVisible?: number;
}

export function SourceChips({ sources, maxVisible = 6 }: SourceChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  return (
    <ScrollArea className="w-full">
      <div ref={scrollRef} className="flex gap-2 pb-2">
        {sources.map((source, idx) => (
          <a
            key={idx}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group"
          >
            <Card className="h-12 min-w-[160px] px-3 py-2 flex items-center gap-2 bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 transition-all cursor-pointer">
              {/* Favicon */}
              {source.favicon && (
                <img 
                  src={source.favicon} 
                  alt="" 
                  className="w-4 h-4 rounded-sm flex-shrink-0"
                />
              )}
              
              {/* Publisher Name */}
              <span className="text-sm text-zinc-300 truncate group-hover:text-zinc-100">
                {source.title}
              </span>
              
              {/* Optional Tag */}
              {source.tag && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                  {source.tag}
                </Badge>
              )}
            </Card>
          </a>
        ))}
      </div>
    </ScrollArea>
  );
}
```

**Styling:**
- Height: `h-12` (48px)
- Width: `min-w-[160px]` with truncation
- Colors: zinc-900 background, zinc-800 border
- Hover: Lighter background + border

**ScrollArea:** Use shadcn `ScrollArea` for smooth horizontal scrolling.

---

### 4. `AnswerSections.tsx` (Content Sections)

**Purpose:** Render sectioned content with inline citations.

```typescript
interface AnswerSectionsProps {
  sections: SearchAnswerPayload["sections"];
  sources: SearchAnswerPayload["sources"];
}

export function AnswerSections({ sections, sources }: AnswerSectionsProps) {
  return (
    <div className="space-y-6">
      {sections.map((section, idx) => (
        <section key={idx} className="space-y-3">
          {/* Section Heading */}
          <h2 className="text-lg font-semibold text-zinc-200 tracking-tight">
            {section.heading}
          </h2>
          
          {/* Bullet List */}
          <ul className="space-y-2.5">
            {section.bullets.map((bullet, bulletIdx) => (
              <li key={bulletIdx} className="flex items-start gap-2 text-zinc-300 leading-relaxed">
                <span className="text-zinc-500 mt-1 select-none">•</span>
                <div className="flex-1">
                  {/* Bullet Text */}
                  <RichText content={bullet.text} />
                  
                  {/* Inline Source Badge */}
                  {bullet.sourceIndex !== undefined && sources[bullet.sourceIndex] && (
                    <InlineSourceBadge source={sources[bullet.sourceIndex]} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

**Styling:**
- Headings: `text-lg`, semibold, zinc-200
- Bullets: Custom bullet (•), not default list-style
- Spacing: `space-y-2.5` between bullets, `space-y-6` between sections
- Line height: `leading-relaxed` for readability

**RichText Component:** (Simple HTML sanitizer)
```typescript
function RichText({ content }: { content: string }) {
  // Allow only <strong>, <em>, <code> tags
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ["strong", "em", "code", "b", "i"],
  });
  
  return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

---

### 5. `InlineSourceBadge.tsx` (Citation Badges)

**Purpose:** Tiny badge next to bullet text linking to source.

```typescript
interface InlineSourceBadgeProps {
  source: SearchAnswerPayload["sources"][number];
}

export function InlineSourceBadge({ source }: InlineSourceBadgeProps) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-1.5 inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors no-underline"
      aria-label={`Source: ${source.title}`}
    >
      {/* Favicon */}
      {source.favicon && (
        <img src={source.favicon} alt="" className="w-3 h-3 rounded-[2px]" />
      )}
      
      {/* Publisher Name */}
      <span className="max-w-[80px] truncate">
        {source.title}
      </span>
    </a>
  );
}
```

**Key Details:**
- Size: Very small (text-[10px], 10px font)
- Favicon: 12px (w-3 h-3)
- Max width: 80px with truncation
- Inline: `ml-1.5` to separate from text
- Colors: zinc-900 bg, zinc-700 border

---

### 6. `FollowUpBar.tsx` (Input + Actions)

**Purpose:** Prompt for follow-up questions with quick actions.

```typescript
interface FollowUpBarProps {
  suggestions?: string[];
  onSubmit?: (query: string) => void;
}

export function FollowUpBar({ suggestions, onSubmit }: FollowUpBarProps) {
  const [input, setInput] = useState("");
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSubmit?.(input.trim());
      setInput("");
    }
  };
  
  return (
    <div className="mt-8 space-y-3">
      {/* Suggestions (optional) */}
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              className="text-xs text-zinc-400 border-zinc-800 hover:bg-zinc-900"
              onClick={() => setInput(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      )}
      
      {/* Input Bar */}
      <form onSubmit={handleSubmit}>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 flex items-center gap-2">
          {/* Text Input */}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up"
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-zinc-200 placeholder:text-zinc-600"
          />
          
          {/* Action Icons */}
          <div className="flex items-center gap-1">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
              aria-label="Voice input"
            >
              <Mic className="h-4 w-4" />
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
              aria-label="Image search"
            >
              <Image className="h-4 w-4" />
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
              aria-label="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
```

**Key Features:**
- **Suggestions:** Optional chips above input (click to populate)
- **Input:** Borderless inside container, placeholder "Ask a follow-up"
- **Actions:** 4 icon buttons (Search, Mic, Image, More)
- **Submit:** Enter key or Search button
- **Styling:** Dark container (zinc-950), subtle border (zinc-800)

**Icons:** Use `lucide-react` icons.

---

## 🔌 Integration

### Chat Message Renderer

**Where:** In the main chat message component that handles tool outputs.

**Before:**
```typescript
if (message.tool === "web.search") {
  return <SearchResponse metadata={metadata} llmContent={content} />;
}
```

**After:**
```typescript
if (message.tool === "web.search") {
  const payload = normalizeToAnswerPayload(metadata, content);
  return (
    <SearchAnswer 
      payload={payload}
      onFollowUpSubmit={(query) => {
        // Dispatch to chat send action with context
        sendMessage(query, { context: { kind: "web_followup" } });
      }}
    />
  );
}
```

### Image Tab Integration

**When `mode === "images"`:** Render existing image grid component.

```typescript
// In SearchAnswer.tsx
{activeTab === "images" && (
  <ImageSearchGrid query={payload.query} />
)}
```

**Note:** Image grid component should already exist. If not, create simple placeholder.

---

## 🎨 Styling Guidelines

### Color Palette (Zinc)
```css
/* Backgrounds */
--bg-primary: zinc-950      /* #09090b */
--bg-secondary: zinc-900    /* #18181b */
--bg-tertiary: zinc-800     /* #27272a */

/* Borders */
--border-primary: zinc-800  /* #27272a */
--border-secondary: zinc-700 /* #3f3f46 */

/* Text */
--text-primary: zinc-100    /* #f4f4f5 */
--text-secondary: zinc-300  /* #d4d4d8 */
--text-muted: zinc-400      /* #a1a1aa */
--text-subtle: zinc-500     /* #71717a */
```

### Typography
- **Headings:** font-semibold, tracking-tight
- **Body:** leading-relaxed (line-height: 1.625)
- **Small text:** text-xs or text-[10px]

### Spacing
- **Container:** px-4 py-6
- **Sections:** space-y-6
- **Bullets:** space-y-2.5
- **Chips:** gap-2

### Interactions
- **Hover:** Lighten background by one zinc step
- **Active:** Ring with zinc-700
- **Transitions:** transition-colors duration-200

---

## 🧪 Testing & Validation

### Test Harness

**Create:** `app/dev/search-answer/page.tsx`

```typescript
import { SearchAnswer } from "@/components/search/search-answer";

const SAMPLE_PAYLOAD: SearchAnswerPayload = {
  query: "whats the latest news in AI",
  mode: "answer",
  sources: [
    {
      url: "https://deadline.com/...",
      title: "deadline",
      favicon: "/favicons/deadline.png",
    },
    {
      url: "https://nytimes.com/...",
      title: "nytimes",
      favicon: "/favicons/nyt.png",
    },
    {
      url: "https://crescendo.ai/...",
      title: "crescendo.ai",
    },
  ],
  sections: [
    {
      heading: "Major Product Launches and Partnerships",
      bullets: [
        {
          text: "OpenAI has released "Atlas", a new AI-powered web browser with integrated AI research and automation features, directly challenging Google in the search and browser market.",
          sourceIndex: 2,
        },
        {
          text: "Alibaba has launched Qwen3-Coder, a massive, open-source AI coding model designed to compete globally in software development automation.",
          sourceIndex: 0,
        },
      ],
    },
    {
      heading: "Industry Investments and Expansions",
      bullets: [
        {
          text: "Google is investing $9 billion in new AI data centers in Oklahoma, emphasizing sustainable energy use and support for training large models.",
          sourceIndex: 2,
        },
        {
          text: "Meta has announced massive financial commitments, including plans to spend hundreds of billions of dollars to build large-scale AI data centers and achieve 'superintelligence' goals.",
          sourceIndex: 1,
        },
      ],
    },
  ],
  stepsCaption: "Assistant steps",
  followups: [
    "summarize the investments",
    "show only open-source model launches",
  ],
};

export default function SearchAnswerTestPage() {
  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <SearchAnswer 
        payload={SAMPLE_PAYLOAD}
        onFollowUpSubmit={(q) => console.log("Follow-up:", q)}
      />
    </div>
  );
}
```

**Access:** Navigate to `/dev/search-answer` in browser.

### Acceptance Checklist

#### Visual
- [ ] Query title is large, high contrast, sentence case
- [ ] Tabs render correctly with Answer active by default
- [ ] Source chips are compact, scrollable, show favicons
- [ ] "Assistant steps" caption is small and muted
- [ ] Section headings are prominent (text-lg, semibold)
- [ ] Bullets have custom bullets (•), proper spacing
- [ ] Inline source badges are tiny, clickable
- [ ] Follow-up bar has input + 4 action icons
- [ ] Overall layout matches reference screenshot

#### Interaction
- [ ] Clicking source chip opens URL in new tab
- [ ] Clicking inline badge opens source URL
- [ ] Tab switching works (Answer ↔ Images)
- [ ] Follow-up input accepts Enter key
- [ ] Follow-up suggestions populate input when clicked

#### Responsive
- [ ] Mobile: chips are swipeable (touch scroll)
- [ ] Mobile: text wraps properly, no horizontal scroll
- [ ] Desktop: container max-width keeps readable line length

#### Accessibility
- [ ] All interactive elements have aria-labels
- [ ] Color contrast ≥ 4.5:1 (zinc-100 on zinc-950)
- [ ] Keyboard navigation works (Tab, Enter)
- [ ] Screen reader friendly (semantic HTML)

#### Performance
- [ ] No layout shift during load
- [ ] Smooth scrolling in source chips
- [ ] No unnecessary re-renders

---

## 📦 Deliverables

### Files to Create/Modify

**New Files:**
1. `components/search/search-answer.tsx`
2. `components/search/answer-header.tsx`
3. `components/search/follow-up-bar.tsx`
4. `lib/utils/strings.ts` (add `toSentenceCase`)

**Refactor Files:**
5. `components/search/source-chips.tsx` (refactor from `source-cards.tsx`)
6. `components/search/answer-sections.tsx` (refactor from `categorized-sections.tsx`)
7. `components/search/inline-source-badge.tsx` (refactor from `inline-source-tag.tsx`)

**Integration:**
8. Update chat message renderer to use `<SearchAnswer>`
9. Add data normalization function

**Test Harness:**
10. `app/dev/search-answer/page.tsx`

### Pull Request Requirements

**Title:** "feat: Perplexity-style search answer view"

**Description:**
```markdown
## Summary
Refactored search response UI to match Perplexity's Answer view with:
- Compact source chips with favicons
- Sectioned content with inline citations
- Follow-up input with quick actions
- Clean monochrome dark theme

## Changes
- Created `SearchAnswer` main wrapper
- Created `AnswerHeader` for query + tabs
- Created `FollowUpBar` for input + actions
- Refactored source chips for denser layout
- Refactored sections for better typography
- Refactored inline badges for smaller footprint

## Screenshots
- Desktop view (full width)
- Mobile view (responsive)
- Source chips scrolling
- Follow-up bar interaction

## Testing
- [x] Visual match with reference
- [x] All interactions work
- [x] Responsive on mobile
- [x] Accessibility check passed
- [x] Test harness at /dev/search-answer
```

---

## 🚨 Important Constraints

### DO NOT
- ❌ Change data fetching (Brave API + MCP stays as-is)
- ❌ Add spinners or loading states (handled upstream)
- ❌ Add cost indicators or token meters
- ❌ Use global CSS resets
- ❌ Use green colors (monochrome zinc only)
- ❌ Create new API routes
- ❌ Modify tool definitions

### DO
- ✅ Use existing `SearchResultMetadata` type
- ✅ Use shadcn/ui components (Tabs, Badge, Card, Button, Input, ScrollArea)
- ✅ Use Tailwind classes exclusively
- ✅ Follow existing component patterns
- ✅ Keep client-side rendering
- ✅ Add proper TypeScript types
- ✅ Add aria-labels for accessibility

---

## 💡 Implementation Tips

### 1. Start with Test Harness
Build the test page first with sample data. This lets you iterate quickly without touching the chat integration.

### 2. Component Order
Implement in this order:
1. `AnswerHeader` (simplest)
2. `SourceChips` (visual feedback)
3. `InlineSourceBadge` (reusable)
4. `AnswerSections` (uses badge)
5. `FollowUpBar` (standalone)
6. `SearchAnswer` (orchestrator)

### 3. Styling Iteration
- Set up test harness with hot reload
- Compare side-by-side with reference screenshot
- Use browser DevTools to match spacing/sizing exactly
- Check dark mode in browser (should be default)

### 4. Data Normalization
Create the normalization function early and test it separately:
```typescript
// Test in Node REPL or Vitest
const normalized = normalizeToAnswerPayload(sampleMetadata, sampleContent);
console.log(JSON.stringify(normalized, null, 2));
```

### 5. Accessibility
- Use semantic HTML (`<nav>`, `<section>`, `<article>`)
- Add `aria-label` to icon buttons
- Test with keyboard only
- Run Lighthouse accessibility audit

---

## 📚 Reference Documentation

### shadcn/ui Components Used
- [Tabs](https://ui.shadcn.com/docs/components/tabs)
- [Card](https://ui.shadcn.com/docs/components/card)
- [Badge](https://ui.shadcn.com/docs/components/badge)
- [Button](https://ui.shadcn.com/docs/components/button)
- [Input](https://ui.shadcn.com/docs/components/input)
- [ScrollArea](https://ui.shadcn.com/docs/components/scroll-area)

### Tailwind Classes Reference
- [Spacing](https://tailwindcss.com/docs/padding)
- [Typography](https://tailwindcss.com/docs/font-size)
- [Colors](https://tailwindcss.com/docs/customizing-colors#color-palette-reference) (zinc)

### lucide-react Icons
- [Search](https://lucide.dev/icons/search)
- [Mic](https://lucide.dev/icons/mic)
- [Image](https://lucide.dev/icons/image)
- [MoreHorizontal](https://lucide.dev/icons/more-horizontal)

---

## 🎬 Conclusion

This prompt provides everything needed to implement a pixel-perfect Perplexity Answer view:
- Clear component breakdown
- Complete code examples
- Styling specifications
- Integration instructions
- Test harness
- Acceptance criteria

The implementation refactors existing components rather than rebuilding from scratch, ensuring smooth integration with the current codebase.

**Estimated Time:** 4-6 hours for experienced developer
**Complexity:** Medium (mostly UI refinement, no backend changes)

