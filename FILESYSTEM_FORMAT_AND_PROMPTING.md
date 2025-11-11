# File System Format and Prompting Locations

## Summary

This document shows where:
1. **File system response formatting** is handled
2. **Tool call prompting and absolute path instructions** are defined

---

## 1. File System Response Formatting 📋

### Location: `lib/chat/tool-handler.ts`

**Function**: `formatToolResultForLLM()` (Lines 1019-1318)

**How it works**:
- File system tools (`fs_read`, `fs_write`, `fs_list`, `fs_delete`) are executed via MCP server
- Results come back as JSON from the MCP API
- The `formatToolResultForLLM()` function formats these results before sending to LLM

**Current Formatting**:
- **MCP tool results** (including file system tools) are returned as-is (JSON)
- No special formatting is applied to file system results currently
- Results are passed through directly from MCP server response

**Example Flow**:
```
1. LLM calls fs_read({path: "/home/user/file.txt"})
2. Tool handler calls /api/mcp/call
3. MCP server returns: {content: "...", size: 1234, type: "text/plain"}
4. formatToolResultForLLM() returns JSON.stringify(result)
5. LLM receives formatted JSON
```

**Key Code** (Lines 1019-1031):
```typescript
export function formatToolResultForLLM(result: ToolResult): string {
  if (result.error) {
    return JSON.stringify({
      error: true,
      message: result.error,
      tool: result.name,
    }, null, 2);
  }
  
  // Format the result nicely
  if (typeof result.result === "string") {
    return result.result;
  }
  
  // ... other tool-specific formatting (email, web_search, etc.)
  // File system tools fall through to default JSON.stringify
}
```

**Note**: File system tool results are currently formatted as JSON. If you want custom formatting (like how web_search has `formatSearchResultsForLLM()`), you would add it here.

---

## 2. Tool Call Prompting and Absolute Path Instructions 📝

### Location 1: Tool Definitions (`lib/chat/tool-definitions.ts`)

**File**: `lib/chat/tool-definitions.ts` (Lines 27-108)

**What it contains**:
- Tool descriptions that guide the LLM on when/how to use each tool
- Parameter descriptions that emphasize absolute paths
- Instructions embedded in tool descriptions

**Key Instructions**:

#### `fs_read` (Lines 29-45):
```typescript
{
  name: "fs_read",
  description: "Read the contents of a file...",
  parameters: {
    properties: {
      path: {
        type: "string",
        description: "Absolute path to the file to read"  // ← Absolute path emphasized
      }
    }
  }
}
```

#### `fs_write` (Lines 47-67):
```typescript
{
  name: "fs_write",
  description: "Write content to a file. USE THIS TOOL IMMEDIATELY when asked to edit... CRITICAL: If multiple files with the same name are open, you MUST use the FULL ABSOLUTE PATH to identify the correct file. NEVER use just the filename - always use the complete path.",
  parameters: {
    properties: {
      path: {
        type: "string",
        description: "FULL ABSOLUTE PATH to the file to write (e.g., '/home/user/project/README.md'). CRITICAL: If multiple files with the same name exist, you MUST use the full path to specify which file. Use the exact path from the file context, especially the active file path when user says 'this file'."
      }
    }
  }
}
```

#### `fs_list` (Lines 69-89):
```typescript
{
  name: "fs_list",
  description: "List files and directories... IMPORTANT: This tool REQUIRES an absolute path. If the user references a directory by name only (e.g., '2.0 directory', 'my project'), you MUST first use cmd_execute with the 'find' command to locate it, then use the full absolute path here.",
  parameters: {
    properties: {
      path: {
        type: "string",
        description: "Directory path to list (MUST be an absolute path, e.g., '/home/user/Desktop/2.0' or '~/Desktop/2.0'). If you only have a directory name, use cmd_execute with 'find' command first to locate it."
      }
    }
  }
}
```

#### `fs_delete` (Lines 91-108):
```typescript
{
  name: "fs_delete",
  description: "Delete a file or directory... This tool REQUIRES an absolute path. If the user references a file/directory by name only, first use cmd_execute with 'find' to locate it, then use the full absolute path here.",
  parameters: {
    properties: {
      path: {
        type: "string",
        description: "File or directory path to delete (MUST be an absolute path, e.g., '/home/user/file.txt' or '~/Desktop/folder'). If you only have a name, use cmd_execute with 'find' command first to locate it."
      }
    }
  }
}
```

---

### Location 2: System Prompt Context (`app/api/chat/route.ts`)

**File**: `app/api/chat/route.ts` (Lines 131-198)

**Function**: `buildContextMessage()` - Adds file system path guidance when MCP session is available

**Key Sections**:

#### Common File System Paths (Lines 133-141):
```typescript
parts.push("=== FILE SYSTEM PATHS AND BEST PRACTICES ===");
parts.push("");
parts.push("COMMON FILE SYSTEM PATHS:");
parts.push("- Desktop folder: Use '~/Desktop' or '/home/[username]/Desktop' (Linux) or '/Users/[username]/Desktop' (macOS) or 'C:\\Users\\[username]\\Desktop' (Windows)");
parts.push("- Documents folder: Use '~/Documents' or '/home/[username]/Documents' (Linux) or '/Users/[username]/Documents' (macOS) or 'C:\\Users\\[username]\\Documents' (Windows)");
parts.push("- Downloads folder: Use '~/Downloads' or '/home/[username]/Downloads' (Linux) or '/Users/[username]/Downloads' (macOS) or 'C:\\Users\\[username]\\Downloads' (Windows)");
parts.push("");
parts.push("When user says 'Desktop folder' or 'save to Desktop', use the Desktop path above.");
parts.push("You can use '~' as shorthand for the user's home directory.");
```

#### File Naming Best Practices (Lines 143-151):
```typescript
parts.push("FILE NAMING BEST PRACTICES:");
parts.push("- Use descriptive, kebab-case filenames: 'ai-trends-2025.md', 'react-best-practices.md'");
parts.push("- Include date when relevant: 'news-2025-01-27.md', 'research-summary-2025-01-27.md'");
parts.push("- Make filenames searchable and meaningful");
parts.push("- Avoid generic names like 'summary.md' or 'document.md' - be specific");
parts.push("- Examples of good filenames:");
parts.push("  • 'ai-developments-2025-01-27.md' (includes topic and date)");
parts.push("  • 'react-hooks-comparison.md' (descriptive and specific)");
parts.push("  • 'typescript-best-practices-research.md' (clear topic)");
```

#### Multi-Tool Workflows (Lines 178-197):
```typescript
parts.push("MULTI-TOOL WORKFLOWS:");
parts.push("You can chain tools together to create powerful workflows:");
parts.push("- web_search → fs_write: Search the web and save results to a file");
parts.push("  Example: 'Search for AI trends and save to Desktop'");
parts.push("  → Call web_search({query: 'AI trends'})");
parts.push("  → Process and format results");
parts.push("  → Call fs_write({path: '~/Desktop/ai-trends-[date].md', content: '...'})");
```

---

### Location 3: File Context Message (`components/chat/chat-interface.tsx`)

**File**: `components/chat/chat-interface.tsx` (Lines 161-447)

**Function**: `buildFileContextMessage()` - Provides context about open files

**Key Instructions** (Lines 364-380):
```typescript
parts.push("CRITICAL RULES FOR FILE OPERATIONS:");
parts.push("");
parts.push("1. DETERMINE FILE TYPE FIRST:");
parts.push("   - GitHub files: Path starts with 'github://' (e.g., 'github://owner/repo/path/to/file.ts')");
parts.push("   - Local files: Regular file paths (e.g., '/home/user/project/README.md')");
parts.push("");
parts.push("2. USE CORRECT TOOLS FOR EACH FILE TYPE:");
parts.push("   - GitHub files: Use github_read_file and github_write_file");
parts.push("   - Local files: Use fs_read and fs_write");
parts.push("");
parts.push("3. USE ABSOLUTE PATHS:");
parts.push("   - Always use the FULL ABSOLUTE PATH from the file context");
parts.push("   - When user says 'this file', use the active file path exactly as shown");
parts.push("   - NEVER use just the filename - always use the complete path");
```

---

## Summary of Locations

| Aspect | Location | Lines |
|--------|----------|-------|
| **Response Formatting** | `lib/chat/tool-handler.ts` | 1019-1318 |
| **Tool Descriptions** | `lib/chat/tool-definitions.ts` | 27-108 |
| **Path Instructions** | `app/api/chat/route.ts` | 131-198 |
| **File Context Rules** | `components/chat/chat-interface.tsx` | 364-380 |

---

## Key Takeaways

1. **Response Formatting**: File system tool results are formatted as JSON in `formatToolResultForLLM()`. No special formatting currently exists (unlike web_search which has custom formatting).

2. **Absolute Path Instructions**: 
   - Embedded in tool descriptions (`tool-definitions.ts`)
   - Reinforced in system prompt (`route.ts`)
   - Emphasized in file context (`chat-interface.tsx`)

3. **Path Examples**: System prompt provides OS-specific examples:
   - Linux: `/home/[username]/Desktop`
   - macOS: `/Users/[username]/Desktop`
   - Windows: `C:\Users\[username]\Desktop`
   - Shorthand: `~/Desktop`

4. **Workflow Instructions**: System prompt includes examples of chaining tools (e.g., `web_search → fs_write`).

