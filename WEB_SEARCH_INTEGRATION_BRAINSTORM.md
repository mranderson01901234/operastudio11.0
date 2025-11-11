# Web Search Integration Brainstorm - LLM + File System, Email, GitHub

## Executive Summary

This document explores the best ways to integrate web search capabilities with the LLM and the three core features: **File System**, **Email**, and **GitHub**. The integration is already partially implemented - web search tools are available to the LLM, and it can chain them with other tools. This document focuses on **optimizing** and **enhancing** these integrations.

---

## Current State Analysis

### ✅ What's Already Working

1. **Web Search Tools Available**
   - `web_search` - General web search (always available)
   - `web_search_images` - Image search
   - `web_search_news` - News search
   - All tools are always available (no account needed)

2. **File System Tools Available**
   - `fs_read` - Read files
   - `fs_write` - Write files
   - `fs_list` - List directories
   - Available when MCP session is active

3. **Tool Chaining Capability**
   - LLM can call multiple tools in sequence
   - Tool results are formatted and fed back to LLM
   - LLM can make decisions based on tool results

### 🎯 The Goal

Enable seamless workflows like:
- **"Search the web for AI information and create a document summary in the Desktop folder"**
- **"Find the latest React documentation and email it to me"**
- **"Search GitHub for TypeScript projects and save the top 5 to a file"**

---

## Integration Pattern 1: Web Search → File System

### Current Capability

The LLM **already can** do this! When you prompt:
```
"Search the web for AI information and create a document summary in the Desktop folder"
```

The LLM will:
1. Call `web_search({query: "AI information"})`
2. Receive formatted search results
3. Process and summarize the results
4. Call `fs_write({path: "~/Desktop/ai-summary.md", content: "..."})`

### ✅ What Works Well

- **Automatic Tool Chaining**: LLM naturally chains tools when instructed
- **Context Awareness**: LLM understands Desktop folder = `~/Desktop` or `/home/user/Desktop`
- **Result Formatting**: Search results are formatted for LLM consumption
- **Error Handling**: If one tool fails, LLM can adapt

### 🚀 Enhancement Ideas

#### 1. **Smart File Naming**
**Problem**: LLM might create generic filenames like `summary.md`

**Solution**: Enhance LLM instructions to:
- Use descriptive filenames based on search query
- Include date in filename: `ai-trends-2025-01-27.md`
- Use kebab-case for filenames: `latest-ai-developments.md`

**Implementation**: Update `buildContextMessage()` in `/app/api/chat/route.ts`:
```typescript
parts.push("FILE NAMING BEST PRACTICES:");
parts.push("- Use descriptive, kebab-case filenames: 'ai-trends-2025.md'");
parts.push("- Include date when relevant: 'news-2025-01-27.md'");
parts.push("- Make filenames searchable and meaningful");
```

#### 2. **Automatic Desktop Path Detection**
**Problem**: Desktop path varies (`~/Desktop`, `/home/user/Desktop`, `C:\Users\user\Desktop`)

**Solution**: Provide Desktop path in context message

**Implementation**: Add to `buildFileContextMessage()`:
```typescript
// Detect Desktop path
const desktopPath = process.env.HOME 
  ? `${process.env.HOME}/Desktop` 
  : os.homedir() + "/Desktop";

parts.push(`Desktop folder path: ${desktopPath}`);
parts.push(`When user says "Desktop folder", use: ${desktopPath}`);
```

#### 3. **Structured Document Templates**
**Problem**: Summaries might be unstructured

**Solution**: Provide templates for common document types

**Implementation**: Add to context message:
```typescript
parts.push("DOCUMENT TEMPLATES:");
parts.push("For research summaries, use this structure:");
parts.push("# [Topic] Research Summary");
parts.push("## Date: [Current Date]");
parts.push("## Key Findings");
parts.push("- [Finding 1]");
parts.push("## Sources");
parts.push("- [Source 1](URL)");
```

#### 4. **Multi-Search Aggregation**
**Problem**: Single search might not be comprehensive

**Solution**: LLM can call multiple searches and aggregate

**Example Prompt**:
```
"Search for 'AI trends 2025', 'machine learning news', and 'neural networks research', 
then create a comprehensive summary document in Desktop"
```

**Current Behavior**: LLM will naturally call `web_search` multiple times, then synthesize

#### 5. **Incremental Document Building**
**Problem**: Large summaries might hit token limits

**Solution**: Enable append mode for documents

**Enhancement**: Add `fs_append` tool (or enhance `fs_write` with append mode):
```typescript
{
  name: "fs_write",
  description: "... Use append: true to add content to existing file instead of overwriting"
}
```

---

## Integration Pattern 2: Web Search → Email

### Current Capability

The LLM **already can** do this! When you prompt:
```
"Search for the latest React documentation and email it to me"
```

The LLM will:
1. Call `web_search({query: "latest React documentation"})`
2. Receive search results
3. Format results into email body
4. Call `email_send({to: "user@example.com", subject: "...", body: "..."})`

### ✅ What Works Well

- **Email Integration**: Email tools are available when Gmail account is connected
- **Result Formatting**: Search results formatted for email consumption
- **Cross-Tool Awareness**: LLM understands it can use search + email together

### 🚀 Enhancement Ideas

#### 1. **Rich Email Formatting**
**Problem**: Plain text emails might not be well-formatted

**Solution**: Enhance LLM instructions for email formatting

**Implementation**: Add to context when email tools are available:
```typescript
parts.push("EMAIL FORMATTING BEST PRACTICES:");
parts.push("- Use HTML formatting for better readability");
parts.push("- Include clickable links: <a href='URL'>Link Text</a>");
parts.push("- Use headings and bullet points for structure");
parts.push("- Include source citations");
```

#### 2. **Email Templates for Search Results**
**Problem**: Each email might be formatted differently

**Solution**: Provide email templates

**Example Template**:
```typescript
parts.push("SEARCH RESULT EMAIL TEMPLATE:");
parts.push("Subject: [Topic] Research Summary");
parts.push("Body:");
parts.push("<h2>Research Summary: [Topic]</h2>");
parts.push("<h3>Key Findings:</h3>");
parts.push("<ul>");
parts.push("<li>[Finding] - <a href='[URL]'>Source</a></li>");
parts.push("</ul>");
```

#### 3. **Multi-Recipient Support**
**Problem**: User might want to email multiple people

**Solution**: LLM can use `email_send` with multiple recipients (if supported)

**Enhancement**: Document this capability in tool description

#### 4. **Scheduled Email Sending**
**Problem**: User might want to send emails later

**Solution**: Add email scheduling capability (future enhancement)

---

## Integration Pattern 3: Web Search → GitHub

### Current Capability

The LLM **already can** do this! When you prompt:
```
"Search GitHub for TypeScript projects and save the top 5 to a file"
```

The LLM will:
1. Call `web_search({query: "TypeScript projects GitHub"})` OR use `github_list_repos`
2. Receive results
3. Process and filter top 5
4. Call `fs_write` or `github_write_file` to save

### ✅ What Works Well

- **GitHub Tools**: Available when GitHub account is connected
- **Flexibility**: LLM can choose between web search or GitHub API
- **File Operations**: Can save to local filesystem or GitHub repos

### 🚀 Enhancement Ideas

#### 1. **GitHub-Specific Search Enhancement**
**Problem**: Web search might not be optimal for GitHub content

**Solution**: Enhance GitHub tool descriptions to encourage GitHub API usage

**Implementation**: Update `github-tool-definitions.ts`:
```typescript
{
  name: "github_list_repos",
  description: "... Use this INSTEAD of web_search when searching for GitHub repositories, as it provides better results and metadata."
}
```

#### 2. **Repository Analysis Workflow**
**Problem**: User might want to analyze multiple repos

**Solution**: Enable multi-repo analysis workflow

**Example Prompt**:
```
"Search GitHub for 'react hooks' repositories, read the top 3 README files, 
and create a comparison document"
```

**Current Behavior**: LLM will:
1. Call `github_list_repos` or `web_search`
2. Call `github_read_file` for each repo's README
3. Call `fs_write` to create comparison document

#### 3. **GitHub Gist Creation**
**Problem**: User might want to share search results as Gist

**Solution**: Add GitHub Gist creation tool (future enhancement)

---

## Advanced Integration Patterns

### Pattern 4: Multi-Tool Research Workflow

**Example**: "Research AI trends, save to Desktop, email summary, and create GitHub issue"

**LLM Workflow**:
1. `web_search({query: "AI trends 2025"})`
2. `fs_write({path: "~/Desktop/ai-research.md", content: "..."})`
3. `email_send({to: "...", subject: "AI Research Summary", body: "..."})`
4. `github_create_issue({owner: "...", repo: "...", title: "...", body: "..."})`

**Enhancement**: Add workflow templates to context message

### Pattern 5: Iterative Research

**Example**: "Search for AI news, then search for each company mentioned, create comprehensive report"

**LLM Workflow**:
1. Initial `web_search` for AI news
2. Extract company names from results
3. Multiple `web_search` calls for each company
4. Aggregate and synthesize
5. `fs_write` comprehensive report

**Current Behavior**: ✅ Already works! LLM can iterate based on results

### Pattern 6: Search → Validate → Save

**Example**: "Search for React best practices, validate against official docs, save verified list"

**LLM Workflow**:
1. `web_search({query: "React best practices"})`
2. `web_search({query: "React official documentation"})` for validation
3. Cross-reference and filter
4. `fs_write` verified list

---

## Implementation Recommendations

### Phase 1: Quick Wins (Immediate)

1. **Enhance Context Messages**
   - Add Desktop path detection
   - Add file naming best practices
   - Add document templates

2. **Improve Tool Descriptions**
   - Make tool descriptions more explicit about chaining
   - Add examples of multi-tool workflows

3. **Add Path Resolution Helpers**
   - Provide common paths (Desktop, Documents, Downloads) in context

### Phase 2: Enhanced Workflows (Short-term)

1. **Document Templates**
   - Research summary template
   - Email template for search results
   - GitHub issue template

2. **Smart File Operations**
   - Auto-detect file type from content
   - Suggest appropriate file extensions
   - Handle file conflicts gracefully

3. **Result Formatting Enhancements**
   - Better markdown formatting for file outputs
   - Rich HTML for email outputs
   - Structured JSON for data outputs

### Phase 3: Advanced Features (Long-term)

1. **Workflow Templates**
   - Pre-defined workflows users can invoke
   - "Research and summarize" workflow
   - "Search and email" workflow

2. **Incremental Building**
   - `fs_append` tool for building documents incrementally
   - Support for large document generation

3. **Search Result Caching**
   - Cache search results to avoid redundant API calls
   - Share cached results across tool calls

4. **Multi-Source Aggregation**
   - Combine web search + GitHub search + email search
   - Unified result format

---

## Best Practices for Prompting

### ✅ Good Prompts

1. **Specific and Clear**
   ```
   "Search the web for 'AI trends 2025', summarize the top 5 findings, 
   and save to ~/Desktop/ai-trends-summary.md"
   ```

2. **Multi-Step Workflows**
   ```
   "Search for React best practices, validate against official docs, 
   create a markdown file in Desktop with verified practices"
   ```

3. **Format Specifications**
   ```
   "Search for TypeScript news, create a well-formatted markdown document 
   with headings and bullet points, save to Desktop"
   ```

### ❌ Avoid These Patterns

1. **Too Vague**
   ```
   "Search and save"  // What to search? Where to save?
   ```

2. **Conflicting Instructions**
   ```
   "Search GitHub" but user means web search, not GitHub API
   ```

3. **Unrealistic Expectations**
   ```
   "Search everything about AI and create perfect summary"  // Too broad
   ```

---

## Example Use Cases

### Use Case 1: Research Document Creation

**User Prompt**:
```
"Search the web for 'latest developments in AI 2025', create a comprehensive 
research document with sources, and save it to my Desktop folder as 'ai-research-2025.md'"
```

**LLM Actions**:
1. `web_search({query: "latest developments in AI 2025", count: 15})`
2. Process results, extract key findings
3. Format as markdown document with:
   - Title and date
   - Executive summary
   - Key findings (bulleted)
   - Sources (with links)
4. `fs_write({path: "~/Desktop/ai-research-2025.md", content: "..."})`

**Enhancement Needed**: 
- Desktop path detection ✅
- Document template ✅
- File naming guidance ✅

### Use Case 2: Email Newsletter Creation

**User Prompt**:
```
"Search for the top 5 tech news stories today, create an email newsletter 
format, and email it to me"
```

**LLM Actions**:
1. `web_search_news({query: "tech news", freshness: "pd", count: 5})`
2. Format as HTML email with:
   - Subject: "Tech News Digest - [Date]"
   - HTML body with headings and links
3. `email_send({to: "user@example.com", subject: "...", body: "..."})`

**Enhancement Needed**:
- Email template ✅
- HTML formatting guidance ✅

### Use Case 3: GitHub Repository Research

**User Prompt**:
```
"Search GitHub for React component libraries, read the README files of the 
top 3, and create a comparison document"
```

**LLM Actions**:
1. `github_list_repos({query: "react component library", sort: "stars"})` OR
   `web_search({query: "React component libraries GitHub"})`
2. Identify top 3 repositories
3. `github_read_file({owner: "...", repo: "...", path: "README.md"})` x3
4. Compare features, pros/cons
5. `fs_write({path: "~/Desktop/react-libraries-comparison.md", content: "..."})`

**Enhancement Needed**:
- GitHub search guidance ✅
- Comparison template ✅

---

## Technical Implementation Details

### File System Integration

**Current Flow**:
```
User Prompt → LLM → web_search() → Results → LLM Processing → fs_write() → File Created
```

**Enhancements**:
1. **Path Resolution**: Add Desktop/Documents/Downloads paths to context
2. **File Naming**: Guide LLM to use descriptive, kebab-case names
3. **Templates**: Provide document structure templates
4. **Error Handling**: Better error messages for path issues

### Email Integration

**Current Flow**:
```
User Prompt → LLM → web_search() → Results → LLM Processing → email_send() → Email Sent
```

**Enhancements**:
1. **Formatting**: HTML email templates
2. **Templates**: Pre-defined email structures
3. **Recipients**: Better handling of recipient addresses
4. **Attachments**: Future: attach files from search results

### GitHub Integration

**Current Flow**:
```
User Prompt → LLM → web_search() OR github_list_repos() → Results → 
LLM Processing → github_write_file() OR fs_write() → File Saved
```

**Enhancements**:
1. **Search Guidance**: When to use GitHub API vs web search
2. **Repository Operations**: Better support for multi-repo workflows
3. **File Operations**: Save to GitHub repos or local filesystem

---

## Context Message Enhancements

### Recommended Additions to `buildContextMessage()`

```typescript
// File System Paths
parts.push("COMMON FILE SYSTEM PATHS:");
parts.push(`- Desktop: ${desktopPath}`);
parts.push(`- Documents: ${documentsPath}`);
parts.push(`- Downloads: ${downloadsPath}`);
parts.push("When user says 'Desktop folder', use the Desktop path above.");

// File Naming Best Practices
parts.push("FILE NAMING BEST PRACTICES:");
parts.push("- Use descriptive, kebab-case filenames");
parts.push("- Include date when relevant: 'topic-2025-01-27.md'");
parts.push("- Make filenames searchable and meaningful");
parts.push("- Examples: 'ai-trends-2025.md', 'react-best-practices.md'");

// Document Templates
parts.push("DOCUMENT TEMPLATES:");
parts.push("For research summaries:");
parts.push("# [Topic] Research Summary");
parts.push("## Date: [Current Date]");
parts.push("## Key Findings");
parts.push("- [Finding with source link]");
parts.push("## Sources");
parts.push("- [Source Title](URL)");

// Multi-Tool Workflows
parts.push("MULTI-TOOL WORKFLOWS:");
parts.push("You can chain tools together:");
parts.push("- web_search → fs_write: Search and save to file");
parts.push("- web_search → email_send: Search and email results");
parts.push("- web_search → github_write_file: Search and save to GitHub");
parts.push("- Multiple searches → Aggregate → Save: Research workflow");
```

---

## Testing Scenarios

### Test Case 1: Basic Search → Save
**Prompt**: "Search for AI trends and save to Desktop"
**Expected**: 
- ✅ `web_search` called
- ✅ Results processed
- ✅ `fs_write` called with Desktop path
- ✅ File created successfully

### Test Case 2: Multi-Search → Aggregate → Save
**Prompt**: "Search for 'React', 'Vue', and 'Angular' trends, compare them, save to Desktop"
**Expected**:
- ✅ Multiple `web_search` calls
- ✅ Results aggregated
- ✅ Comparison document created
- ✅ `fs_write` called

### Test Case 3: Search → Email
**Prompt**: "Search for tech news and email me the summary"
**Expected**:
- ✅ `web_search_news` called
- ✅ Results formatted for email
- ✅ `email_send` called with formatted content

### Test Case 4: Search → GitHub
**Prompt**: "Search GitHub for TypeScript projects, save top 5 to file"
**Expected**:
- ✅ `github_list_repos` or `web_search` called
- ✅ Top 5 identified
- ✅ `fs_write` or `github_write_file` called

---

## Conclusion

The integration between web search and File System/Email/GitHub is **already functional**! The LLM can chain tools naturally. The main enhancements needed are:

1. **Better Context**: Provide paths, templates, and best practices
2. **Clearer Guidance**: Help LLM make better decisions about tool usage
3. **Templates**: Pre-defined structures for common workflows
4. **Path Resolution**: Automatic detection of common paths

### Next Steps

1. ✅ **Immediate**: Add Desktop path detection and file naming guidance
2. ✅ **Short-term**: Add document templates and email formatting
3. ✅ **Long-term**: Advanced workflows and incremental building

The foundation is solid - we just need to polish the user experience and provide better guidance to the LLM!

