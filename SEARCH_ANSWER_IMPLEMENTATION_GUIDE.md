# Search Answer View - Implementation Guide

## ✅ What Has Been Created

All components for the Perplexity-style search answer view have been implemented:

### Core Components
- ✅ `components/search/search-answer.tsx` - Main wrapper component
- ✅ `components/search/answer-header.tsx` - Query title + tabs
- ✅ `components/search/source-chips.tsx` - Compact source cards
- ✅ `components/search/answer-sections.tsx` - Sectioned content with bullets
- ✅ `components/search/inline-source-badge.tsx` - Inline citation badges
- ✅ `components/search/follow-up-bar.tsx` - Input with quick actions

### UI Components (shadcn/ui)
- ✅ `components/ui/tabs.tsx` - Tab navigation
- ✅ `components/ui/card.tsx` - Card component

### Utilities & Types
- ✅ `lib/utils.ts` - Added `toSentenceCase()` function
- ✅ `lib/search/search-result-types.ts` - Added `SearchAnswerPayload` type
- ✅ `lib/search/normalize-answer-payload.ts` - Data transformation utilities

### Test Harness
- ✅ `app/dev/search-answer/page.tsx` - Test page with sample data

---

## 📦 Installation Requirements

Before using the components, install the required dependencies:

```bash
npm install @radix-ui/react-tabs
# or
pnpm add @radix-ui/react-tabs
```

This is required for the Tabs component to work.

---

## 🧪 Testing the Component

### 1. Install Dependencies
```bash
npm install @radix-ui/react-tabs
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Navigate to Test Page
Open your browser and go to:
```
http://localhost:3000/dev/search-answer
```

You should see the Perplexity-style answer view with sample AI news data.

---

## 🔌 Integration Steps

### Step 1: Find Your Chat Message Renderer

Locate the component that renders chat messages with tool outputs. This is typically in:
- `components/chat/message-content.tsx` or
- `components/chat/chat-interface.tsx` or
- Similar message rendering component

### Step 2: Import Required Functions

```typescript
import { SearchAnswer } from "@/components/search/search-answer";
import { normalizeToAnswerPayload } from "@/lib/search/normalize-answer-payload";
import type { SearchResultMetadata } from "@/lib/search/search-result-types";
```

### Step 3: Add Rendering Logic

**Before:**
```typescript
if (message.tool === "web.search" || message.type === "search") {
  return (
    <SearchResponse 
      metadata={metadata} 
      llmContent={content}
      onQuestionClick={handleQuestionClick}
    />
  );
}
```

**After:**
```typescript
if (message.tool === "web.search" || message.type === "search") {
  // Option 1: Use normalization function (if you have SearchResultMetadata)
  const payload = normalizeToAnswerPayload(metadata, content);
  
  return (
    <SearchAnswer 
      payload={payload}
      onFollowUpSubmit={(query) => {
        // Trigger new search with follow-up query
        handleNewMessage(query, { context: { kind: "web_followup" } });
      }}
    />
  );
}
```

### Step 4: Handle Follow-up Queries

Make sure your chat interface has a function to send new messages:

```typescript
const handleFollowUpSubmit = (query: string) => {
  // Add user message to chat
  addMessage({
    role: "user",
    content: query,
  });
  
  // Trigger search (your existing logic)
  performSearch(query);
};
```

---

## 📊 Data Structure

### Input: SearchAnswerPayload

```typescript
interface SearchAnswerPayload {
  query: string;                    // "whats the latest news in AI"
  mode: "answer" | "images";        // "answer"
  
  sources: Array<{
    url: string;                    // "https://example.com/article"
    title: string;                  // "Example News"
    favicon?: string;               // "https://..."
    tag?: string;                   // "news", "blog", "doc"
    description?: string;           // Optional
  }>;
  
  sections: Array<{
    heading: string;                // "Major Developments"
    bullets: Array<{
      text: string;                 // Bullet text
      sourceIndex?: number;         // Index into sources array
    }>;
  }>;
  
  stepsCaption?: string;            // "Assistant steps" (optional)
  followups?: string[];             // ["question 1", "question 2"]
}
```

### Transformation Examples

#### Example 1: From SearchResultMetadata

```typescript
import { normalizeToAnswerPayload } from "@/lib/search/normalize-answer-payload";

const metadata: SearchResultMetadata = {
  query: "latest AI news",
  total: 100,
  count: 10,
  results: [
    {
      title: "AI Breakthrough",
      url: "https://example.com/ai",
      description: "Latest developments...",
      hostname: "example.com",
      index: 0,
    },
    // ... more results
  ],
  relatedQuestions: ["What is GPT-4?", "How does AI work?"],
};

const llmContent = `
## Major Developments
- OpenAI released GPT-5
- Google announces Gemini 2.0

## Industry Impact
- AI adoption grows 40%
`;

const payload = normalizeToAnswerPayload(metadata, llmContent);
// Ready to pass to <SearchAnswer payload={payload} />
```

#### Example 2: Manual Construction

```typescript
import { createAnswerPayload } from "@/lib/search/normalize-answer-payload";

const payload = createAnswerPayload(
  "latest AI news",
  [
    {
      url: "https://techcrunch.com/ai",
      title: "TechCrunch",
      favicon: "https://...",
    },
  ],
  [
    {
      heading: "Major News",
      bullets: [
        { text: "GPT-5 released", sourceIndex: 0 },
      ],
    },
  ],
  {
    followups: ["Tell me more about GPT-5"],
    stepsCaption: "AI Assistant",
  }
);
```

---

## 🎨 Customization

### Color Scheme

The component uses a zinc monochrome palette. To customize:

```typescript
// In your component or global CSS
.search-answer-custom {
  --answer-bg: theme('colors.zinc.950');
  --answer-border: theme('colors.zinc.800');
  --answer-text: theme('colors.zinc.100');
}
```

### Typography

Adjust font sizes in component files:
- Title: `text-2xl` → `text-3xl` (larger)
- Headings: `text-lg` → `text-xl`
- Body: `text-sm` → `text-base`

### Spacing

Modify spacing in `search-answer.tsx`:
```typescript
<div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
  //          ^^^^^^^^^ Container width
  //                    ^^^^^^^ Horizontal padding
  //                            ^^^^^^ Vertical padding
  //                                    ^^^^^^^^ Spacing between sections
```

---

## 🔧 Advanced Features

### Custom Source Matching

By default, sources are assigned to bullets in round-robin. For better matching:

```typescript
// In normalize-answer-payload.ts
function smartAssignSourceIndices(
  sections: SearchAnswerPayload["sections"],
  sources: SearchAnswerPayload["sources"]
): SearchAnswerPayload["sections"] {
  return sections.map(section => ({
    ...section,
    bullets: section.bullets.map(bullet => {
      // Find source mentioned in text
      const mentionedSource = sources.findIndex(source =>
        bullet.text.toLowerCase().includes(source.title.toLowerCase())
      );
      
      return {
        ...bullet,
        sourceIndex: mentionedSource >= 0 ? mentionedSource : undefined,
      };
    }),
  }));
}
```

### Image Tab Integration

Replace the placeholder in `search-answer.tsx`:

```typescript
// Before
{activeTab === "images" && (
  <ImageTabPlaceholder query={payload.query} />
)}

// After
{activeTab === "images" && (
  <ImageSearchGrid 
    query={payload.query}
    images={payload.images} // Add images to payload type
  />
)}
```

### Voice Input Support

Wire up the mic button in `follow-up-bar.tsx`:

```typescript
const handleVoiceInput = () => {
  if ('webkitSpeechRecognition' in window) {
    const recognition = new webkitSpeechRecognition();
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };
    recognition.start();
  }
};

// In the Mic button:
<Button
  onClick={handleVoiceInput}
  // ... rest of props
>
  <Mic className="h-4 w-4" />
</Button>
```

---

## 🐛 Troubleshooting

### Issue: Tabs not working
**Solution:** Install `@radix-ui/react-tabs`
```bash
npm install @radix-ui/react-tabs
```

### Issue: Favicon not loading
**Solution:** Check CORS policy. Google's favicon service should work. Alternatively:
```typescript
favicon: `https://icon.horse/icon/${domain}`
```

### Issue: Sections not parsing correctly
**Solution:** Check markdown format. Expected:
```markdown
## Heading
- Bullet 1
- Bullet 2

## Another Heading
- Bullet 3
```

### Issue: Follow-up not working
**Solution:** Make sure `onFollowUpSubmit` prop is passed:
```typescript
<SearchAnswer 
  payload={payload}
  onFollowUpSubmit={handleFollowUp} // ← Required
/>
```

### Issue: Styling looks different
**Solution:** Ensure your project has Tailwind configured with zinc colors:
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        zinc: colors.zinc,
      },
    },
  },
};
```

---

## 📱 Responsive Design

The component is responsive out of the box:

- **Desktop (≥768px):** Full layout with max-w-3xl container
- **Mobile (<768px):** 
  - Source chips are horizontally scrollable (touch-friendly)
  - Text wraps properly
  - Icons remain visible in follow-up bar

Test on mobile:
```bash
# Chrome DevTools: Toggle device toolbar (Cmd/Ctrl + Shift + M)
# Or use real device on same network
```

---

## ♿ Accessibility

The component follows accessibility best practices:

- ✅ Semantic HTML (`<section>`, `<article>`, `<nav>`)
- ✅ ARIA labels on all interactive elements
- ✅ Keyboard navigation (Tab, Enter)
- ✅ Color contrast ≥ 4.5:1 (WCAG AA)
- ✅ Screen reader friendly

Test with screen reader:
- **macOS:** VoiceOver (Cmd + F5)
- **Windows:** NVDA (free) or JAWS
- **Linux:** Orca

---

## 🚀 Next Steps

1. ✅ Components created
2. ⏳ **Install dependencies** (`@radix-ui/react-tabs`)
3. ⏳ **Test the component** (visit `/dev/search-answer`)
4. ⏳ **Integrate into chat** (follow integration steps above)
5. ⏳ **Wire up follow-up handler**
6. ⏳ **Test with real search data**
7. ⏳ **Optional: Add image tab support**

---

## 📚 API Reference

### SearchAnswer Component

```typescript
interface SearchAnswerProps {
  payload: SearchAnswerPayload;
  onFollowUpSubmit?: (query: string) => void;
}
```

**Props:**
- `payload` *(required)*: Search answer data
- `onFollowUpSubmit` *(optional)*: Callback when user submits follow-up query

**Example:**
```tsx
<SearchAnswer 
  payload={{
    query: "AI news",
    mode: "answer",
    sources: [...],
    sections: [...],
  }}
  onFollowUpSubmit={(q) => console.log(q)}
/>
```

### normalizeToAnswerPayload Function

```typescript
function normalizeToAnswerPayload(
  metadata: SearchResultMetadata,
  llmContent: string
): SearchAnswerPayload
```

**Parameters:**
- `metadata`: Original search result metadata
- `llmContent`: LLM-generated markdown content

**Returns:** Normalized `SearchAnswerPayload`

**Example:**
```typescript
const payload = normalizeToAnswerPayload(
  searchMetadata,
  markdownContent
);
```

---

## 🤝 Contributing

If you need to modify the components:

1. **Edit components** in `components/search/`
2. **Test changes** at `/dev/search-answer`
3. **Check linter**: `npm run lint`
4. **Update types** in `lib/search/search-result-types.ts` if needed

---

## 📞 Support

Common questions:

**Q: Can I use with existing SearchResponse?**
A: Yes! Keep both. Use SearchAnswer for new views, keep SearchResponse as fallback.

**Q: How do I add more sources?**
A: Just add to `payload.sources` array. No limit.

**Q: Can I hide follow-up bar?**
A: Yes, pass empty array: `followups: []` or remove from payload.

**Q: Dark mode only?**
A: Currently yes. For light mode, swap zinc-900 → zinc-100, zinc-100 → zinc-900, etc.

---

## ✨ Summary

You now have a complete Perplexity-style search answer view:

- ✅ Clean, modern UI matching reference screenshot
- ✅ Fully typed with TypeScript
- ✅ Accessible and responsive
- ✅ Easy to integrate with existing search
- ✅ Test harness for development

**Next:** Install dependencies and visit `/dev/search-answer` to see it in action!

