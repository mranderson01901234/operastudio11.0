# GitHub UI Flow Diagram

**Date:** 2025-01-27  
**Purpose:** Visual flow diagram of GitHub UI behavior

---

## User Flow

### 1. Initial State (GitHub Connected)

```
┌─────────────────┐  ┌─────────────────────────────────────┐
│   Sidebar       │  │         Main Content Area            │
│                 │  │                                     │
│  📁 Repo 1      │  │         Chat Interface              │
│  📁 Repo 2      │  │         (Full Width)                │
│  📁 Repo 3      │  │                                     │
│  📁 Repo 4      │  │                                     │
│  ...            │  │                                     │
│                 │  │                                     │
│  [Repository    │  │                                     │
│   List View]    │  │                                     │
└─────────────────┘  └─────────────────────────────────────┘
```

**State:**
- `selectedTool === "github"`
- `sidebarView === "repositories"`
- `selectedRepository === null`
- Right panel: Chat Interface (full width)

---

### 2. Repository Selected

```
┌─────────────────┐  ┌─────────────────────────────────────┐
│   Sidebar       │  │         Right Panel (50%)           │
│                 │  │                                     │
│  ← Back         │  │  owner/repo-name                    │
│  📁 repo-name   │  │  Description text...                │
│                 │  │                                     │
│  Branch: main ▼ │  │  [Code] [Issues] [PRs] [Actions]... │
│  🔍 Go to file  │  │  ──────────────────────────────────│
│                 │  │                                     │
│  📁 src/        │  │  📄 README.md                       │
│    📁 components│  │                                     │
│      📄 button  │  │  # Repository Name                  │
│      📄 input   │  │                                     │
│    📄 index.ts  │  │  Description...                     │
│  📄 package.json│ │                                     │
│                 │  │                                     │
│  [File Tree     │  │  [Repository Viewer]               │
│   View]         │  │                                     │
└─────────────────┘  └─────────────────────────────────────┘
                     ┌─────────────────────────────────────┐
                     │         Left Panel (50%)            │
                     │                                     │
                     │         Chat Interface              │
                     │                                     │
                     └─────────────────────────────────────┘
```

**State:**
- `selectedTool === "github"`
- `sidebarView === "files"`
- `selectedRepository === { owner: "user", repo: "repo-name" }`
- Right panel: Repository Viewer (50% width)
- Left panel: Chat Interface (50% width)

---

### 3. File Clicked (Opens in Editor)

```
┌─────────────────┐  ┌─────────────────────────────────────┐
│   Sidebar       │  │         Right Panel (50%)           │
│                 │  │                                     │
│  ← Back         │  │  owner/repo-name                    │
│  📁 repo-name   │  │  Description text...                │
│                 │  │                                     │
│  Branch: main ▼ │  │  [Code] [Issues] [PRs] [Actions]... │
│  🔍 Go to file  │  │  ──────────────────────────────────│
│                 │  │                                     │
│  📁 src/        │  │  📄 README.md                       │
│    📁 components│  │                                     │
│      📄 button  │  │  # Repository Name                  │
│      📄 input   │  │                                     │
│    📄 index.ts  │  │  Description...                     │
│  📄 package.json│ │                                     │
│                 │  │                                     │
│  [File Tree]    │  │  [Repository Viewer]               │
└─────────────────┘  └─────────────────────────────────────┘
                     ┌─────────────────────────────────────┐
                     │         Left Panel (50%)            │
                     │                                     │
                     │         Chat Interface              │
                     │                                     │
                     └─────────────────────────────────────┘
                     ┌─────────────────────────────────────┐
                     │      Code Editor (Overlay/Tabs)     │
                     │                                     │
                     │  [index.ts] [button.tsx] [README]  │
                     │  ──────────────────────────────────│
                     │                                     │
                     │  import React from 'react';        │
                     │  ...                                │
                     │                                     │
                     │  [File Editor View]                 │
                     └─────────────────────────────────────┘
```

**State:**
- File clicked → `openFileInEditor()` called
- File opens in code editor (same as filesystem feature)
- Editor tabs appear (like FileEditorView)
- Repository viewer stays visible in right panel

---

## Component State Transitions

### Sidebar State Machine

```
[Initial State]
    │
    ├─ GitHub Tool Selected
    │
    ▼
[Repository List View]
    │
    ├─ Repository Clicked
    │
    ▼
[File Tree View]
    │
    ├─ File Clicked → Opens in Editor
    │
    ├─ Back Button Clicked
    │
    ▼
[Repository List View]
```

### Right Panel State Machine

```
[Chat Interface - Full Width]
    │
    ├─ Repository Selected
    │
    ▼
[Repository Viewer - 50% Width]
    │
    ├─ Tab Selected (Code, Issues, PRs, etc.)
    │
    ▼
[Tab Content Displayed]
```

---

## Key Behaviors

### 1. Sidebar Navigation
- **Repository List** → Click repo → **File Tree**
- **File Tree** → Click file → **Opens in Editor**
- **File Tree** → Back button → **Repository List**

### 2. Right Panel Display
- **No repo selected** → Chat Interface (full width)
- **Repo selected** → Repository Viewer (50% width) + Chat Interface (50% width)

### 3. File Opening
- Click file in sidebar → Opens in code editor
- Uses existing `useFileEditor` context
- Same behavior as filesystem feature
- Editor tabs appear above chat interface

### 4. Tab Navigation
- All 9 tabs visible: Code, Issues, Pull Requests, Actions, Projects, Wiki, Security, Insights, Settings
- Active tab highlighted with orange underline
- Tab content loads based on selection

---

## Component Responsibilities

### RepositoryList Component
- **Purpose**: Show all repositories
- **Location**: Sidebar (initial state)
- **Actions**: 
  - Load repositories from API
  - Search/filter repositories
  - Click repository → `selectRepository(owner, repo)`

### RepositoryFileTree Component
- **Purpose**: Show repository file tree
- **Location**: Sidebar (when repo selected)
- **Actions**:
  - Load file tree from API
  - Expand/collapse directories
  - Click file → `openFileInEditor(owner, repo, path)`
  - Back button → `deselectRepository()`

### RepositoryViewer Component
- **Purpose**: Show repository details and tabs
- **Location**: Right panel (50% width)
- **Actions**:
  - Display repository header
  - Show tab navigation
  - Load tab content based on active tab
  - Display README, issues, PRs, etc.

---

## Integration Points

### 1. File Editor Integration
```typescript
// In RepositoryFileTree component
const { openFile } = useFileEditor();

const handleFileClick = async (filePath: string) => {
  // Fetch file content from GitHub API
  const content = await fetchFileContent(owner, repo, filePath);
  
  // Open in editor (same as filesystem)
  openFile({
    path: `github://${owner}/${repo}/${filePath}`,
    content: content,
    language: detectLanguage(filePath)
  });
};
```

### 2. Context Integration
```typescript
// GitHub context manages sidebar view state
const { sidebarView, selectedRepository, selectRepository, deselectRepository } = useGitHub();

// File system context manages tool selection
const { selectedTool, setSelectedTool } = useFileSystem();

// File editor context manages open files
const { openFile, state } = useFileEditor();
```

---

## Visual Reference

Based on GitHub's actual UI (from image description):

**Repository Header:**
- Owner/repo name: "mranderson01901234 / 5.0"
- Tabs: Code, Issues, Pull Requests, Actions, Projects, Wiki, Security, Insights, Settings
- Buttons: Pin, Watch, Fork, Star

**File Tree (Sidebar):**
- Branch selector: "master" with "4 Branches" and "0 Tags"
- "Go to file" search bar
- "Add file" and "Code" dropdown buttons
- Recent commit info
- File/directory list with icons

**Right Panel:**
- About section with description
- Stats: stars, watching, forks
- Releases section
- Packages section
- Contributors section
- Languages section (bar chart)
- Suggested workflows

---

**End of Flow Diagram**

