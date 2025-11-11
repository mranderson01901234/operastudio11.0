# File Context Awareness Implementation Plan

## Overview
Enable the LLM to automatically be aware of files opened in the Monaco editor, allowing users to reference files implicitly (e.g., "review this file") without explicitly naming them.

## Current Architecture Analysis

### Components Involved
1. **FileEditorProvider** (`contexts/file-editor-context.tsx`)
   - Manages `openFiles: Map<string, FileState>`
   - Tracks `activeFile: string | null`
   - Provides `useFileEditor()` hook

2. **ChatInterface** (`components/chat/chat-interface.tsx`)
   - Sends messages to `/api/chat`
   - Currently only sends user message content
   - No awareness of open files

3. **API Route** (`app/api/chat/route.ts`)
   - Receives messages array
   - Validates and passes to `streamChat()`

4. **Message Formatting** (`lib/clients/gemini.ts`)
   - `formatMessagesForGemini()` formats messages for Gemini API
   - Supports system messages (combined with first user message)
   - Supports history and latest user text

### Data Flow
```
User Input → ChatInterface → /api/chat → streamChat() → formatMessagesForGemini() → Gemini API
```

## Implementation Strategy

### Phase 1: File Context Collection
**Location:** `components/chat/chat-interface.tsx`

**Changes:**
1. Import `useFileEditor` hook
2. Access `state.openFiles` and `state.activeFile`
3. Create function to build file context from open files
4. Determine which files to include:
   - Always include `activeFile` if exists
   - Optionally include all open files (with token limit consideration)
   - Include file path, language, and content

**File Context Structure:**
```typescript
interface FileContext {
  path: string;
  language: string;
  content: string;
  isActive: boolean;
  isModified: boolean;
}
```

### Phase 2: Context Injection into Messages
**Location:** `components/chat/chat-interface.tsx` (in `sendMessage` function)

**Approach Options:**

#### Option A: System Message Approach (Recommended)
- Inject file context as a system message before user message
- System message explains what files are open and their contents
- Pros: Clear separation, LLM understands context explicitly
- Cons: Uses system message slot

#### Option B: Prepend to User Message
- Prepend file context directly to user message content
- Format: `[File Context]\n\n[User Message]`
- Pros: Simple, no system message needed
- Cons: Less structured, might confuse LLM

#### Option C: Separate Context Field
- Add optional `fileContext` field to message payload
- Modify API route to handle context separately
- Pros: Clean separation, extensible
- Cons: Requires API changes

**Recommended: Option A (System Message)**

**Implementation:**
```typescript
function buildFileContextMessage(openFiles: Map<string, FileState>, activeFile: string | null): string {
  if (openFiles.size === 0) {
    return "";
  }
  
  const files = Array.from(openFiles.values());
  const contextParts: string[] = [];
  
  contextParts.push("The user has the following files open in the editor:");
  
  files.forEach((file) => {
    const isActive = file.path === activeFile;
    const status = isActive ? " (currently active)" : "";
    const modified = file.isModified ? " (modified)" : "";
    
    contextParts.push(`\n\nFile: ${file.path}${status}${modified}`);
    contextParts.push(`Language: ${file.language}`);
    contextParts.push(`Content:\n\`\`\`${file.language}\n${file.content}\n\`\`\``);
  });
  
  if (activeFile) {
    contextParts.push(`\n\nThe user is currently viewing: ${activeFile}`);
  }
  
  contextParts.push("\n\nWhen the user refers to 'this file', 'the file', 'the current file', or similar, they are referring to the active file.");
  contextParts.push("When they refer to 'these files' or 'all files', they mean all open files.");
  
  return contextParts.join("");
}
```

### Phase 3: Message Payload Enhancement
**Location:** `components/chat/chat-interface.tsx` (in `sendMessage`)

**Changes:**
1. Build file context message before sending
2. If context exists, prepend as system message to payload
3. Ensure system message is properly formatted for Gemini

**Code Structure:**
```typescript
const sendMessage = async () => {
  // ... existing code ...
  
  const { state } = useFileEditor();
  const fileContextMessage = buildFileContextMessage(state.openFiles, state.activeFile);
  
  const payload = [...messages, userMessage].map((message) => ({
    role: message.role,
    content: message.content,
  }));
  
  // Inject file context as system message if files are open
  if (fileContextMessage) {
    payload.unshift({
      role: "system",
      content: fileContextMessage,
    });
  }
  
  // ... rest of sendMessage ...
};
```

### Phase 4: Context Updates
**Consideration:** Should context update when files change?

**Options:**
1. **Static Context (Per Message)**: Context is captured at message send time
   - Pros: Simple, predictable
   - Cons: Context might be stale if files change during conversation

2. **Dynamic Context (Always Current)**: Rebuild context for each message
   - Pros: Always up-to-date
   - Cons: More complex, potential token waste

**Recommended: Dynamic Context (Always Current)**
- Rebuild context for each message send
- Ensures LLM always has latest file contents
- User can modify files and immediately reference them

### Phase 5: Token Management
**Consideration:** Large files could exceed token limits

**Strategies:**
1. **Include All Files**: Simple, but risky for large files
2. **Token Limit Check**: Truncate or exclude files if too large
3. **Smart Selection**: Only include active file + recently modified files
4. **File Size Limits**: Set max file size (e.g., 10KB) to include

**Recommended: Smart Selection with Limits**
- Always include active file (truncated if > 50KB)
- Include other open files if total context < 100KB
- Show file count if files excluded: "You have 5 more files open..."

**Implementation:**
```typescript
function buildFileContextMessage(
  openFiles: Map<string, FileState>, 
  activeFile: string | null,
  maxContextSize: number = 100000 // ~100KB
): string {
  if (openFiles.size === 0) return "";
  
  const files = Array.from(openFiles.values());
  let contextSize = 0;
  const includedFiles: FileState[] = [];
  
  // Always include active file first
  if (activeFile) {
    const active = files.find(f => f.path === activeFile);
    if (active) {
      includedFiles.push(active);
      contextSize += active.content.length;
    }
  }
  
  // Include other files if space allows
  for (const file of files) {
    if (file.path === activeFile) continue;
    if (contextSize + file.content.length > maxContextSize) break;
    includedFiles.push(file);
    contextSize += file.content.length;
  }
  
  // Build context message...
  // If files excluded, mention it
}
```

### Phase 6: User Experience Enhancements
**Optional Features:**

1. **Visual Indicator**: Show in chat that file context is being sent
   - Badge showing "X files open"
   - Tooltip showing which files

2. **Context Preview**: Show user what context will be sent
   - Expandable section in chat input area
   - "Files being sent: file1.ts, file2.ts"

3. **Explicit File Selection**: Allow user to choose which files to include
   - Checkbox list of open files
   - "Include all" / "Include active only" toggle

**Recommended: Start Simple**
- No UI changes initially
- Add visual indicators later if needed

## Implementation Steps

### Step 1: Create File Context Builder Function
- Create `buildFileContextMessage()` function
- Handle empty state
- Format file information clearly

### Step 2: Integrate into ChatInterface
- Import `useFileEditor` hook
- Call context builder in `sendMessage`
- Inject system message into payload

### Step 3: Test Basic Flow
- Open a file
- Send message referencing "this file"
- Verify LLM receives file context
- Verify LLM understands file reference

### Step 4: Handle Edge Cases
- No files open
- Multiple files open
- Very large files
- Modified vs unmodified files

### Step 5: Optimize Token Usage
- Implement file size limits
- Implement context size limits
- Add truncation for large files

### Step 6: Add User Feedback (Optional)
- Visual indicator of files being sent
- Context preview

## File Changes Required

1. **components/chat/chat-interface.tsx**
   - Import `useFileEditor`
   - Add `buildFileContextMessage()` function
   - Modify `sendMessage()` to inject context

2. **No API Changes Required**
   - System messages are already supported
   - No changes needed to `/api/chat` route
   - No changes needed to Gemini client

## Testing Scenarios

1. **No Files Open**
   - Send message → Should work normally, no context sent

2. **Single File Open**
   - Open `test.ts`
   - Send "review this file"
   - LLM should reference `test.ts` correctly

3. **Multiple Files Open**
   - Open `file1.ts`, `file2.ts`, `file3.ts`
   - Set `file2.ts` as active
   - Send "check this file for errors"
   - LLM should reference `file2.ts` (active file)

4. **File Modified**
   - Open file, modify it
   - Send "what changed?"
   - LLM should see modified content

5. **Large Files**
   - Open very large file (>100KB)
   - Send message
   - Context should be truncated appropriately

6. **File Changes During Conversation**
   - Open file, send message
   - Modify file
   - Send another message
   - LLM should see updated content

## Success Criteria

✅ User can open a file and immediately reference it without naming it
✅ LLM correctly identifies which file user is referring to
✅ Multiple open files are handled correctly
✅ Active file is prioritized in context
✅ Token limits are respected
✅ Performance is not significantly impacted

## Future Enhancements

1. **File Diff Context**: Show what changed since last message
2. **Selection Context**: Include selected code ranges
3. **Project Context**: Include related files from project
4. **Git Context**: Include git diff information
5. **LSP Context**: Include language server diagnostics

