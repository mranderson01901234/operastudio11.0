# Web Search Decision Flow - How Web Search is Triggered

## Overview

Web search is **automatically triggered by the LLM (Gemini)** based on:
1. **System prompt instructions** that guide when to use search
2. **Tool availability** - search tools are always included
3. **LLM's decision** - the model decides when to call the tool

## Decision Process

### 1. Tool Availability ✅

**Location**: `app/api/chat/route.ts` (Lines ~400-450)

Search tools (`SEARCH_TOOLS`) are **always available** to all users - they don't require any account connections:

```typescript
// Search tools are always included
const availableTools = [
  ...FILE_TOOLS,
  CMD_EXECUTE_TOOL,
  ...SEARCH_TOOLS,  // ✅ Always included
  ...(hasEmailAccount ? EMAIL_TOOLS : []),
  ...(hasGitHubAccount ? GITHUB_TOOLS : []),
  ...(hasImageEditingSession ? IMAGEN_EDIT_TOOLS : []),
  ...IMAGEN_TOOLS,
];
```

**Available Search Tools**:
- `web_search` - General web search
- `web_search_images` - Image search
- `web_search_news` - News search

### 2. System Prompt Instructions 📋

**Location**: `lib/chat/context-cache.ts` (Lines 7-52)

The system prompt includes detailed instructions on **WHEN** to use web search:

#### ✅ ALWAYS Use Web Search For:
- Current events, news, or anything time-sensitive after January 2025
- Recent data (stock prices, weather, sports scores, trending topics)
- Specific URLs, websites, or online resources the user mentions
- Questions explicitly asking for 'latest', 'recent', 'current', or 'up-to-date' info
- Technical documentation or API references that change frequently
- Local business info, store hours, restaurant menus, contact information
- Breaking news, product launches after Jan 2025, new software versions
- Real-time information (flight status, package tracking, live scores)
- User asks to 'search for', 'look up', 'find', or 'google' something

#### ❌ DO NOT Use Web Search For:
- General knowledge questions (history, science, math, common facts)
- Programming concepts, language syntax, algorithms
- File system, email, or GitHub operations (use specialized tools instead)
- Questions you can confidently answer from your training data (before Jan 2025)
- Basic calculations, data analysis, or code generation
- Code review, debugging, or explaining code provided by the user
- Explanations of well-established concepts that haven't changed
- Tasks that require using other tools (file operations, email, imagen, etc.)

#### 🤔 Use Judgment:
- If unsure whether information might be outdated, lean toward using search
- For topics with fast-changing landscapes (AI, tech, crypto), prefer search
- If the user seems to want comprehensive/authoritative sources, use search
- For medical, legal, or financial advice, use search for current information
- When accuracy is critical and stakes are high, verify with search

#### ⚠️ Knowledge Cutoff:
- Training data ends in January 2025
- For anything after this date, MUST use web_search

### 3. LLM Decision Making 🤖

**Location**: `lib/clients/gemini.ts` (Lines 149-158)

The LLM receives:
1. **Tool definitions** - Available tools with descriptions
2. **System prompt** - Instructions on when to use each tool
3. **User message** - The actual query

The LLM then:
1. **Analyzes** the user's query
2. **Matches** it against the decision framework in the system prompt
3. **Decides** whether to:
   - Answer directly (from training data)
   - Call `web_search` tool
   - Call `web_search_images` tool
   - Call `web_search_news` tool
   - Use other tools (file system, email, GitHub, etc.)

### 4. Tool Execution 🔧

**Location**: `lib/chat/tool-handler.ts` (Lines 610-838, 1126-1234)

When the LLM decides to use web search:

1. **LLM generates function call**:
   ```json
   {
     "name": "web_search",
     "arguments": {
       "query": "latest AI developments 2025",
       "count": 10
     }
   }
   ```

2. **Tool handler routes the call**:
   - `web_search` → `/api/search/web`
   - `web_search_images` → `/api/search/images`
   - `web_search_news` → `/api/search/news`

3. **Tool handler executes** (`executeSearchToolCall`):
   - Makes POST request to appropriate endpoint
   - Passes query parameters to Brave Search API
   - 30-second timeout
   - Returns formatted results to LLM

4. **Results are formatted**:
   - `web_search`: Uses `formatSearchResultsForLLM()` (Perplexity-style)
   - `web_search_images`: Formats image URLs and thumbnails
   - `web_search_news`: Formats news articles with dates and sources

5. **LLM processes results**:
   - Receives formatted results
   - Presents to user according to Perplexity-style format instructions
   - Includes clickable markdown links `[Source Name](URL)`

## Flow Diagram

```
User Query
    ↓
System Prompt Analysis
    ↓
LLM Decision:
├─ Answer from training data? → Direct answer
├─ Need current info? → web_search
├─ Need images? → web_search_images
├─ Need news? → web_search_news
└─ Need other tools? → File/Email/GitHub tools
    ↓
Tool Call Generated
    ↓
Tool Handler Executes
    ↓
Results Returned to LLM
    ↓
LLM Formats & Presents Results
```

## Key Points

1. **No Manual Trigger**: Web search is **automatically** triggered by the LLM based on the query
2. **Always Available**: Search tools are always included (no account required)
3. **LLM Decision**: The model decides when to search vs. answer directly
4. **System Prompt Guides**: Detailed instructions help the LLM make good decisions
5. **Tool Descriptions**: Each tool has a description that helps the LLM choose the right one

## Examples

### ✅ Will Trigger Web Search:
- "What's the latest news about AI?"
- "Search for TypeScript best practices"
- "Find me information about React 19"
- "What happened in tech this week?"
- "Look up the weather in New York"

### ❌ Won't Trigger Web Search:
- "How do I use React hooks?"
- "Explain JavaScript closures"
- "What is a binary tree?"
- "Write a function to sort an array"
- "Review this code snippet"

## Configuration

**Tool Definitions**: `lib/chat/search-tool-definitions.ts`
- Defines available search tools
- Includes descriptions and parameters

**System Prompt**: `lib/chat/context-cache.ts`
- Contains decision framework
- Guides LLM on when to use search

**Tool Handler**: `lib/chat/tool-handler.ts`
- Executes search tool calls
- Calls Brave Search API
- Returns formatted results

## Summary

**Web search is triggered automatically by the LLM** based on:
1. ✅ Tool availability (always included)
2. 📋 System prompt instructions (when to use)
3. 🤖 LLM's analysis of the user query
4. 🔧 Tool execution via tool handler

The LLM makes the decision autonomously - there's no manual trigger or explicit "search mode". It analyzes each query and decides whether to search or answer directly.

