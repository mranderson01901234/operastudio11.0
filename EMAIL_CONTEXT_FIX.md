# Email Context Bug Fix

## Problem

When starting a new chat and saying "hello", the LLM thinks you have an email open and includes email context in its response, even when you're not viewing the email section.

## Root Cause

### Issue 1: Persistent Active Email
The `activeEmail` state in `email-context.tsx` is persisted to localStorage:

```typescript
// On mount - restores from localStorage
const [activeEmail, setActiveEmailState] = useState<string | null>(() => {
  if (typeof window !== "undefined") {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_EMAIL) || null;
  }
  return null;
});

// On change - saves to localStorage
useEffect(() => {
  if (isInitialized && typeof window !== "undefined") {
    if (activeEmail) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_EMAIL, activeEmail);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_EMAIL);
    }
  }
}, [activeEmail, isInitialized]);
```

**Result**: If you viewed an email in a previous session, `activeEmail` is restored on page reload and stays active.

### Issue 2: Context Injected Regardless of View
The chat interface was injecting email context into **every message**, regardless of which view the user is in:

```typescript
// OLD CODE (Bug):
const emailContextMessage = buildEmailContextMessage(
  emailState.activeEmail,  // Always included if activeEmail exists
  emailState.emails
);
if (emailContextMessage) {
  payload.unshift({
    role: "system",
    content: emailContextMessage,
  });
}
```

**Result**: Even when you're in "Chat" mode or any other view, if there's an active email from localStorage, the LLM receives this context:

```
📧 EMAIL CONTEXT - CURRENTLY SELECTED EMAIL

The user is currently viewing an email in the right sidebar. When the user says:
- 'this email', 'the email', 'current email', 'selected email'
- 'review this email', 'analyze this email', 'summarize this email'
...

--- EMAIL DETAILS ---
Email ID: 123abc
Subject: Previous Email You Viewed
From: someone@example.com
...
```

## Solution

Only inject email context when the user is **actually in the email view**:

```typescript
// NEW CODE (Fixed):
const emailContextMessage = selectedTool === "email" 
  ? buildEmailContextMessage(emailState.activeEmail, emailState.emails)
  : "";
if (emailContextMessage) {
  payload.unshift({
    role: "system",
    content: emailContextMessage,
  });
}
```

## How It Works Now

### When `selectedTool === "email"` (Email View Active):
✅ Email context IS included
- User is in email view
- Active email is shown in right panel
- LLM should know about it

### When `selectedTool === "chat"` or anything else:
❌ Email context NOT included
- User is in chat/filesystem/GitHub view
- No email is visible
- LLM should not assume email context

## Testing

### Before Fix:
```
User: [Opens app, previously viewed an email]
User: [Selects "Chat" from sidebar]
User: "hello"
LLM: "Hello! I see you have an email from someone@example.com about..."
       ❌ WRONG - No email is visible!
```

### After Fix:
```
User: [Opens app, previously viewed an email]
User: [Selects "Chat" from sidebar]
User: "hello"
LLM: "Hello! How can I help you today?"
       ✅ CORRECT - General greeting, no email context

User: [Selects "Email" from sidebar]
User: [Active email is displayed in right panel]
User: "hello"
LLM: "Hello! I can see you have an email from someone@example.com..."
       ✅ CORRECT - Email context is appropriate here
```

## Files Changed

- `components/chat/chat-interface.tsx` - Added `selectedTool === "email"` check before building email context

## Related Behavior

The same pattern should be applied to other contexts:
- ✅ File context - Already uses `fileEditorState.openFiles` (only when files are actually open)
- ✅ GitHub context - Tied to `selectedTool === "github"`
- ✅ Image context - Only included when `currentImageId` exists
- ✅ Email context - Now only included when `selectedTool === "email"` ← **FIXED**

## Why localStorage Persistence Is Still OK

The `activeEmail` localStorage persistence is still useful because:
1. When you switch to email view, your last viewed email is restored
2. Page refreshes don't lose your place
3. The context just shouldn't leak into other views

The fix doesn't change the persistence behavior - it just prevents the context from being sent to the LLM when you're not in the email view.

## Summary

**Problem**: LLM receives email context even when not viewing emails
**Cause**: `activeEmail` persisted in localStorage + context always injected
**Fix**: Only inject email context when `selectedTool === "email"`
**Result**: LLM only knows about emails when you're actually viewing them

