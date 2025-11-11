# GitHub UI Implementation Plan: Sidebar & Repository Viewer

**Date:** 2025-01-27  
**Goal:** Implement GitHub repository sidebar and 50/50 split view with accurate GitHub UI styling

---

## Overview

**Sidebar Behavior (Two States):**
1. **Initial State**: Show all repositories when GitHub is connected
2. **Repository Selected**: Show repository file tree (like FileTree for filesystem)
3. **File Clicked**: Open file in code editor (like filesystem feature)

**Right Panel (50% of Chat):**
- Show GitHub repository header with all tabs: **Code**, **Issues**, **Pull Requests**, **Actions**, **Projects**, **Wiki**, **Security**, **Insights**, **Settings**
- Always visible when repository is selected
- Matches GitHub's actual repository page layout

**UI Accuracy**: Match GitHub's actual UI design as closely as possible

---

## 1. Current Architecture Pattern

### 1.1 Sidebar Pattern (Email Example)

**File**: `components/layout/app-sidebar.tsx`
```typescript
const showFileTree = selectedTool === "filesystem" && sessionStatus === "connected";
const showEmailList = selectedTool === "email";

{showFileTree ? (
  <FileTree />
) : showEmailList ? (
  <EmailList />
) : (
  <SidebarNav />
)}
```

**Pattern to Follow:**
- Check `selectedTool === "github"` and `hasGitHubAccount`
- Show `RepositoryList` component initially (similar to `EmailList`)
- When repository selected, show `RepositoryFileTree` component (similar to `FileTree` for filesystem)
- Both components handle navigation between states

**Updated Code Example:**
```typescript
// components/layout/app-sidebar.tsx
export function AppSidebar() {
  const { selectedTool, sessionStatus } = useFileSystem();
  const { sidebarView, hasGitHubAccount } = useGitHub(); // NEW
  
  const showFileTree = selectedTool === "filesystem" && sessionStatus === "connected";
  const showEmailList = selectedTool === "email";
  const showGitHubRepos = selectedTool === "github" && hasGitHubAccount && sidebarView === "repositories";
  const showGitHubFiles = selectedTool === "github" && hasGitHubAccount && sidebarView === "files";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {showFileTree ? (
          <FileTree />
        ) : showEmailList ? (
          <EmailList />
        ) : showGitHubFiles ? (
          <RepositoryFileTree /> // NEW: File tree when repo selected
        ) : showGitHubRepos ? (
          <RepositoryList /> // NEW: Repository list initially
        ) : (
          <SidebarNav />
        )}
      </SidebarContent>
    </Sidebar>
  );
}
```

### 1.2 Split View Pattern (Email Example)

**File**: `app/page.tsx`
```typescript
if (selectedTool === "email" && hasActiveEmail) {
  return (
    <SplitView
      left={<ChatInterface />}
      right={<EmailViewer />}
      defaultRatio={0.5}
      minLeft={300}
      minRight={400}
    />
  );
}
```

**Pattern to Follow:**
- Check `selectedTool === "github"` and `selectedRepository !== null`
- Show `RepositoryViewer` in right panel with all GitHub tabs
- Repository header with: Code, Issues, Pull Requests, Actions, Projects, Wiki, Security, Insights, Settings
- Tab content shows based on active tab selection

**Updated Code Example:**
```typescript
// app/page.tsx
function MainContent() {
  const { state: fileEditorState } = useFileEditor();
  const { selectedTool } = useFileSystem();
  const { state: emailState } = useEmail();
  const { selectedRepository } = useGitHub(); // NEW
  
  const hasOpenFiles = fileEditorState.openFiles.size > 0;
  const hasActiveEmail = emailState.activeEmail !== null;
  const hasSelectedRepo = selectedRepository !== null; // NEW

  // Show GitHub split view if GitHub is selected and repo is selected
  if (selectedTool === "github" && hasSelectedRepo) {
    return (
      <SplitView
        left={<ChatInterface />}
        right={<RepositoryViewer />} // NEW: GitHub repository viewer
        defaultRatio={0.5}
        minLeft={300}
        minRight={400}
      />
    );
  }

  // Show email split view if email is selected
  if (selectedTool === "email" && hasActiveEmail) {
    return (
      <SplitView
        left={<ChatInterface />}
        right={<EmailViewer />}
        defaultRatio={0.5}
        minLeft={300}
        minRight={400}
      />
    );
  }

  // Show file split view if files are open
  if (hasOpenFiles) {
    return (
      <SplitView
        left={<ChatInterface />}
        right={<FileEditorView />}
        defaultRatio={0.5}
        minLeft={300}
        minRight={400}
      />
    );
  }

  return <ChatInterface />;
}
```

---

## 2. GitHub UI Styling Strategy

### 2.1 Option 1: GitHub Primer Design System (Recommended for Accuracy)

**Library**: `@primer/react` (Official GitHub design system)

**Pros:**
- ✅ Official GitHub components
- ✅ Exact GitHub styling
- ✅ Maintained by GitHub
- ✅ Accessible components

**Cons:**
- ⚠️ Additional dependency
- ⚠️ May require theme customization

**Installation:**
```bash
npm install @primer/react
```

**Usage Example:**
```typescript
import { Box, Text, Heading, Avatar, Octicon } from '@primer/react';
import { RepoIcon, StarIcon, GitBranchIcon } from '@primer/octicons-react';
```

### 2.2 Option 2: Custom Styled Components (Recommended for Consistency)

**Approach**: Build custom components styled to match GitHub's UI exactly

**Pros:**
- ✅ No additional dependencies
- ✅ Full control over styling
- ✅ Matches existing codebase pattern (shadcn/ui)
- ✅ Consistent with Email/FileSystem components

**Cons:**
- ⚠️ More work to match GitHub's exact styling
- ⚠️ Need to maintain styling accuracy

**GitHub Design Tokens to Use:**
```css
/* GitHub Color Palette */
--github-bg: #0d1117;
--github-canvas: #0d1117;
--github-border: #30363d;
--github-text: #c9d1d9;
--github-text-secondary: #8b949e;
--github-accent: #1f6feb;
--github-accent-hover: #388bfd;
--github-success: #238636;
--github-danger: #da3633;
--github-warning: #9e6a03;

/* Typography */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
font-size: 14px;
line-height: 1.5;
```

### 2.3 Recommendation: **Option 2 (Custom Styled)**

**Rationale:**
- Matches existing pattern (EmailList, FileTree use custom styling)
- No dependency bloat
- Full control
- Can still reference GitHub's design tokens

---

## 3. Component Structure

### 3.1 Repository List Component (Sidebar - Initial State)

**File**: `components/github/repository-list.tsx`

**Features:**
- List all user repositories (initial view)
- Search/filter repositories
- Show repository name, description, language, stars
- Click repository → switches to file tree view
- Infinite scroll for large lists
- Loading states
- Error handling

**UI Elements:**
- Header with "Back" button (to return to main navigation)
- Search input for filtering repositories
- Repository icon (folder icon)
- Repository name (owner/repo)
- Description (truncated)
- Language badge
- Star count
- Private/Public indicator
- Last updated timestamp

**Styling:**
- Match GitHub's repository list sidebar styling
- Hover effects
- Click repository → transitions to file tree view

### 3.1.1 Repository File Tree Component (Sidebar - Repository Selected)

**File**: `components/github/repository-file-tree.tsx`

**Features:**
- Shows file tree for selected repository (like FileTree for filesystem)
- Expandable directories
- Click file → opens in code editor
- Back button to return to repository list
- Loading states
- Error handling

**UI Elements:**
- Header with repository name and "Back" button
- Branch selector dropdown
- "Go to file" search input
- File tree with expandable directories
- File icons (different for file types)
- Last commit info per file
- Click file → opens in editor

**Styling:**
- Match GitHub's file tree styling
- Match FileTree component structure exactly
- Hover effects
- Selected file highlighting

### 3.2 Repository Viewer Component (Right Panel - 50% of Chat)

**File**: `components/github/repository-viewer.tsx`

**Features:**
- Repository header (name, description, stars, forks, watchers, branch selector)
- **All GitHub Tabs**: Code, Issues, Pull Requests, Actions, Projects, Wiki, Security, Insights, Settings
- Tab content based on active tab
- README preview (in Code tab)
- Repository stats and metadata
- Recent commits
- Contributors

**UI Elements:**
- Repository header (matches GitHub's repo header exactly)
  - Owner/repo name
  - Description
  - Star/Fork/Watch buttons
  - Branch selector
  - Clone button
- Tab navigation bar (all 9 tabs)
- Tab content area (changes based on selected tab)
- Markdown renderer for README
- File content viewer (for Code tab)

**Styling:**
- Exact GitHub repository page styling
- GitHub's tab navigation (orange underline for active tab)
- GitHub's markdown styling
- GitHub's color scheme and typography

---

## 4. Implementation Details

### 4.1 GitHub Context (State Management)

**File**: `contexts/github-context.tsx` (NEW)

```typescript
interface GitHubContextValue {
  // Account state
  hasGitHubAccount: boolean;
  account: GitHubAccount | null;
  
  // Repository state
  repositories: Map<string, Repository>;
  selectedRepository: Repository | null; // { owner: string, repo: string } | null
  sidebarView: 'repositories' | 'files'; // Which view to show in sidebar
  loading: boolean;
  error: string | null;
  
  // Repository details state
  repositoryDetails: RepositoryDetails | null;
  repositoryFiles: FileTree | null; // File tree for selected repository
  activeTab: 'code' | 'issues' | 'pulls' | 'actions' | 'projects' | 'wiki' | 'security' | 'insights' | 'settings';
  
  // Actions
  checkGitHubAccount: () => Promise<void>;
  loadRepositories: () => Promise<void>;
  selectRepository: (owner: string, repo: string) => Promise<void>; // Sets sidebarView to 'files'
  deselectRepository: () => void; // Sets sidebarView back to 'repositories'
  loadRepositoryDetails: (owner: string, repo: string) => Promise<void>;
  loadRepositoryFiles: (owner: string, repo: string, path?: string) => Promise<void>;
  openFileInEditor: (owner: string, repo: string, path: string, ref?: string) => Promise<void>;
}
```

### 4.2 Repository List Component

**File**: `components/github/repository-list.tsx`

```typescript
export function RepositoryList() {
  const { state, selectRepository, loadRepositories } = useGitHub();
  const { setSelectedTool } = useFileSystem();
  const { repositories, selectedRepository, loading, hasGitHubAccount } = state;
  
  // Similar structure to EmailList:
  // - Header with back button
  // - Search/filter input
  // - Scrollable list
  // - Loading states
  // - Empty states
  // - Connect button if not connected
}
```

**Key Features:**
- Search repositories by name
- Filter by language, visibility (public/private)
- Sort by: recently updated, name, stars
- Infinite scroll
- Click repository → calls `selectRepository(owner, repo)` → switches sidebar to file tree view

### 4.2.1 Repository File Tree Component

**File**: `components/github/repository-file-tree.tsx` (NEW - Similar to FileTree)

```typescript
export function RepositoryFileTree() {
  const { selectedRepository, repositoryFiles, loadRepositoryFiles, openFileInEditor, deselectRepository } = useGitHub();
  const { openFile } = useFileEditor(); // Use existing file editor context
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  
  // When repository is selected, load root files
  useEffect(() => {
    if (selectedRepository) {
      loadRepositoryFiles(selectedRepository.owner, selectedRepository.repo, '');
    }
  }, [selectedRepository]);
  
  // Handle file click - open in editor
  const handleFileClick = async (filePath: string) => {
    if (!selectedRepository) return;
    
    // Fetch file content and open in editor
    await openFileInEditor(selectedRepository.owner, selectedRepository.repo, filePath);
  };
  
  // Render file tree similar to FileTree component
  // - Expandable directories
  - Clickable files that open in editor
  - Back button to return to repository list
}
```

**Key Features:**
- Shows file tree for selected repository (like FileTree for filesystem)
- Expandable directories
- Click file → opens in code editor (uses `useFileEditor` context)
- Back button to return to repository list
- Matches FileTree component structure exactly

### 4.3 Repository Viewer Component

**File**: `components/github/repository-viewer.tsx`

```typescript
export function RepositoryViewer() {
  const { state } = useGitHub();
  const { selectedRepository, repositoryDetails, repositoryFiles, activeTab } = state;
  
  if (!selectedRepository) return null;
  
  return (
    <div className="h-full overflow-auto github-repo-viewer">
      {/* Repository Header */}
      <RepositoryHeader repository={selectedRepository} details={repositoryDetails} />
      
      {/* Tab Navigation */}
      <RepositoryTabs activeTab={activeTab} />
      
      {/* Tab Content */}
      {activeTab === 'code' && <CodeTab files={repositoryFiles} />}
      {activeTab === 'issues' && <IssuesTab />}
      {activeTab === 'pulls' && <PullRequestsTab />}
    </div>
  );
}
```

**Components:**
1. **RepositoryHeader**: Name (owner/repo), description, stars, forks, watchers, clone button, branch selector
2. **RepositoryTabs**: All GitHub tabs - Code, Issues, Pull Requests, Actions, Projects, Wiki, Security, Insights, Settings
3. **CodeTab**: Shows repository README and file content (file tree is in sidebar)
4. **IssuesTab**: List of issues with filters
5. **PullRequestsTab**: List of pull requests
6. **ActionsTab**: GitHub Actions workflows
7. **ProjectsTab**: GitHub Projects
8. **WikiTab**: Repository wiki
9. **SecurityTab**: Security alerts and advisories
10. **InsightsTab**: Repository insights and analytics
11. **SettingsTab**: Repository settings (if user has admin access)

---

## 5. GitHub UI Styling Reference

### 5.1 Repository List Item (Sidebar)

**GitHub's Actual Styling:**
- Background: `#0d1117` (dark theme)
- Border: `#30363d`
- Hover: `#161b22`
- Text: `#c9d1d9`
- Secondary text: `#8b949e`

**Component Structure:**
```
┌─────────────────────────────────┐
│ 📁 owner/repo-name              │
│    Description text...           │
│    ⭐ 123  🔵 JavaScript        │
└─────────────────────────────────┘
```

### 5.2 Repository Header (Right Panel)

**GitHub's Actual Styling:**
- Background: `#0d1117`
- Border bottom: `#21262d`
- Padding: `16px 24px`
- Font size: `14px`

**Component Structure:**
```
┌─────────────────────────────────────────────┐
│ owner / repo-name                    ⭐ 123 │
│ Description text...                        │
│ [Code] [Issues] [Pull Requests] [Actions] │
└─────────────────────────────────────────────┘
```

### 5.3 File Tree (Right Panel)

**GitHub's Actual Styling:**
- File icon: `#8b949e`
- Directory icon: `#79c0ff`
- Hover: `#161b22`
- Selected: `#1f6feb` background

**Component Structure:**
```
📁 src/
  📁 components/
    📄 button.tsx
    📄 input.tsx
  📄 index.ts
📄 README.md
📄 package.json
```

---

## 6. Libraries for GitHub UI Accuracy

### 6.1 Markdown Rendering

**Option 1**: `react-markdown` + `remark-gfm` (GitHub Flavored Markdown)
```bash
npm install react-markdown remark-gfm
```

**Option 2**: `@uiw/react-md-editor` (includes GitHub styling)
```bash
npm install @uiw/react-md-editor
```

**Recommendation**: `react-markdown` + `remark-gfm` + custom GitHub CSS

### 6.2 Syntax Highlighting

**Library**: `react-syntax-highlighter`
```bash
npm install react-syntax-highlighter @types/react-syntax-highlighter
```

**Usage**: Highlight code blocks in README and file viewer

### 6.3 Icons

**Library**: `@primer/octicons-react` (GitHub's official icons)
```bash
npm install @primer/octicons-react
```

**Usage**: Repository icons, file icons, action icons

**Alternative**: Use `lucide-react` (already in project) with custom styling

---

## 7. Implementation Steps

### Phase 1: Context & State Management
1. ✅ Create `contexts/github-context.tsx`
2. ✅ Add GitHub account check
3. ✅ Add repository loading logic
4. ✅ Add repository selection logic

### Phase 2: Sidebar Integration
1. ✅ Update `components/layout/app-sidebar.tsx` to show GitHub components
   - Show `RepositoryList` when `sidebarView === 'repositories'`
   - Show `RepositoryFileTree` when `sidebarView === 'files'`
2. ✅ Update `components/layout/sidebar-nav.tsx` to handle GitHub selection
3. ✅ Create `components/github/repository-list.tsx` (initial repository list)
4. ✅ Create `components/github/repository-file-tree.tsx` (file tree when repo selected)
5. ✅ Style repository list items (match GitHub)
6. ✅ Style file tree (match FileTree component structure)

### Phase 3: Split View Integration
1. ✅ Update `app/page.tsx` to show split view for GitHub
2. ✅ Create `components/github/repository-viewer.tsx`
3. ✅ Create repository header component
4. ✅ Create tab navigation component

### Phase 4: Repository Details
1. ✅ Create `components/github/repository-header.tsx`
2. ✅ Create `components/github/repository-tabs.tsx`
3. ✅ Create `components/github/code-tab.tsx` (file tree + viewer)
4. ✅ Create `components/github/file-tree.tsx`
5. ✅ Create `components/github/file-viewer.tsx`

### Phase 5: Advanced Features
1. ✅ Create `components/github/issues-tab.tsx`
2. ✅ Create `components/github/pull-requests-tab.tsx`
3. ✅ Add markdown rendering for README
4. ✅ Add syntax highlighting for code files

---

## 8. File Structure

```
components/
  github/
    ├── repository-list.tsx              # Sidebar: Initial repository list
    ├── repository-file-tree.tsx        # Sidebar: File tree when repo selected (like FileTree)
    ├── repository-viewer.tsx           # Right panel: Main repository viewer (50% of chat)
    ├── repository-header.tsx           # Right panel: Repository header (name, stars, etc.)
    ├── repository-tabs.tsx            # Right panel: Tab navigation (all 9 tabs)
    ├── repository-list-item.tsx       # Sidebar: Individual repo item in list
    ├── code-tab.tsx                    # Right panel: Code tab content (README, file content)
    ├── issues-tab.tsx                  # Right panel: Issues tab content
    ├── pull-requests-tab.tsx          # Right panel: Pull requests tab content
    ├── actions-tab.tsx                 # Right panel: Actions tab content
    ├── projects-tab.tsx                # Right panel: Projects tab content
    ├── wiki-tab.tsx                    # Right panel: Wiki tab content
    ├── security-tab.tsx                # Right panel: Security tab content
    ├── insights-tab.tsx                # Right panel: Insights tab content
    ├── settings-tab.tsx                # Right panel: Settings tab content
    └── github-connect.tsx              # Connection UI (if not connected)

contexts/
  └── github-context.tsx                # GitHub state management

app/
  └── page.tsx                          # Update to include GitHub split view
```

---

## 9. GitHub UI Styling CSS

**File**: `app/globals.css` (add GitHub-specific styles)

```css
/* GitHub Repository List (Sidebar) */
.github-repo-list {
  background: #0d1117;
  color: #c9d1d9;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 14px;
}

.github-repo-item {
  padding: 8px 12px;
  border-bottom: 1px solid #21262d;
  cursor: pointer;
  transition: background-color 0.1s;
}

.github-repo-item:hover {
  background: #161b22;
}

.github-repo-item.selected {
  background: #1f6feb;
  color: white;
}

.github-repo-name {
  font-weight: 600;
  color: #58a6ff;
  font-size: 14px;
}

.github-repo-description {
  color: #8b949e;
  font-size: 12px;
  margin-top: 4px;
}

.github-repo-meta {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: #8b949e;
}

/* GitHub Repository Viewer (Right Panel) */
.github-repo-viewer {
  background: #0d1117;
  color: #c9d1d9;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}

.github-repo-header {
  padding: 16px 24px;
  border-bottom: 1px solid #21262d;
  background: #0d1117;
}

.github-repo-title {
  font-size: 20px;
  font-weight: 600;
  color: #c9d1d9;
  margin-bottom: 8px;
}

.github-repo-description {
  color: #8b949e;
  font-size: 14px;
  margin-bottom: 16px;
}

.github-repo-stats {
  display: flex;
  gap: 24px;
  font-size: 14px;
  color: #8b949e;
}

.github-tabs {
  border-bottom: 1px solid #21262d;
  padding: 0 24px;
  display: flex;
  gap: 8px;
}

.github-tab {
  padding: 8px 16px;
  border-bottom: 2px solid transparent;
  color: #8b949e;
  cursor: pointer;
  font-size: 14px;
  transition: color 0.1s;
}

.github-tab:hover {
  color: #c9d1d9;
}

.github-tab.active {
  color: #f0883e;
  border-bottom-color: #f0883e;
}

/* GitHub File Tree */
.github-file-tree {
  padding: 8px 0;
}

.github-file-item {
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #c9d1d9;
}

.github-file-item:hover {
  background: #161b22;
}

.github-file-icon {
  width: 16px;
  height: 16px;
  color: #8b949e;
}

.github-directory-icon {
  color: #79c0ff;
}
```

---

## 10. API Integration

### 10.1 Load Repositories

**Endpoint**: `GET /api/github/repos`

**Response**: Array of repositories
```typescript
interface Repository {
  id: number;
  name: string;
  full_name: string; // "owner/repo"
  description: string | null;
  private: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  default_branch: string;
}
```

### 10.2 Load Repository Details

**Endpoint**: `GET /api/github/repo/[owner]/[repo]`

**Response**: Detailed repository info
```typescript
interface RepositoryDetails {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  html_url: string;
  clone_url: string;
}
```

### 10.3 Load Repository Files

**Endpoint**: `GET /api/github/repo/[owner]/[repo]/files?path=...&ref=...`

**Response**: File tree
```typescript
interface FileTreeItem {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  sha: string;
  url: string;
}
```

---

## 11. Recommended Libraries

### Core Libraries (Required)
```json
{
  "react-markdown": "^9.0.0",
  "remark-gfm": "^4.0.0",
  "react-syntax-highlighter": "^15.5.0",
  "@primer/octicons-react": "^19.0.0"
}
```

### Optional (For Exact GitHub Styling)
```json
{
  "@primer/react": "^36.0.0"  // Only if using Primer components
}
```

**Recommendation**: Use `react-markdown`, `remark-gfm`, `react-syntax-highlighter`, and `@primer/octicons-react`. Build custom components styled to match GitHub (don't use `@primer/react` to avoid dependency bloat).

---

## 12. Example Component: Repository List Item

```typescript
// components/github/repository-list-item.tsx
import { RepoIcon, StarIcon } from '@primer/octicons-react';
import { cn } from '@/lib/utils';

interface RepositoryListItemProps {
  repository: {
    full_name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    private: boolean;
    updated_at: string;
  };
  isSelected: boolean;
  onClick: () => void;
}

export function RepositoryListItem({ repository, isSelected, onClick }: RepositoryListItemProps) {
  return (
    <div
      className={cn(
        "github-repo-item",
        isSelected && "selected"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <RepoIcon className="w-4 h-4" />
        <span className="github-repo-name">{repository.full_name}</span>
        {repository.private && (
          <span className="text-xs text-sidebar-foreground/50">Private</span>
        )}
      </div>
      {repository.description && (
        <p className="github-repo-description">{repository.description}</p>
      )}
      <div className="github-repo-meta">
        {repository.language && (
          <span>{repository.language}</span>
        )}
        <span className="flex items-center gap-1">
          <StarIcon className="w-3 h-3" />
          {repository.stargazers_count}
        </span>
        <span className="text-xs">
          Updated {formatDistanceToNow(new Date(repository.updated_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}
```

---

## 13. Success Criteria

✅ **Sidebar - Repository List:**
- Repository list shows in sidebar when GitHub tool is selected
- Repositories load from GitHub API
- Search/filter works
- Click repository → switches to file tree view

✅ **Sidebar - File Tree:**
- File tree shows when repository is selected
- Expandable directories work
- Click file → opens in code editor (like filesystem feature)
- Back button returns to repository list

✅ **Right Panel (50% of Chat):**
- Repository viewer shows when repository is selected
- Repository header matches GitHub's header exactly
- All 9 tabs visible: Code, Issues, Pull Requests, Actions, Projects, Wiki, Security, Insights, Settings
- Tab navigation works (orange underline for active tab)
- Tab content loads correctly

✅ **UI Accuracy:**
- Repository viewer matches GitHub's UI styling exactly
- File tree matches GitHub's file tree styling
- README renders with GitHub markdown styling
- Code files show with syntax highlighting
- Color scheme matches GitHub dark theme

✅ **Integration:**
- File opening integrates with existing file editor (like filesystem)
- Loading states and error handling work
- State management works correctly (sidebar view switching)  

---

## 14. Next Steps

1. **Review this plan** and decide on styling approach (custom vs Primer)
2. **Install required libraries** (`react-markdown`, `remark-gfm`, `react-syntax-highlighter`, `@primer/octicons-react`)
3. **Create GitHub context** (`contexts/github-context.tsx`)
4. **Create repository list component** (`components/github/repository-list.tsx`)
5. **Update sidebar** to show repository list
6. **Create repository viewer component** (`components/github/repository-viewer.tsx`)
7. **Update main page** to show split view for GitHub
8. **Add GitHub CSS styles** to `globals.css`
9. **Test end-to-end flow**

---

**End of UI Implementation Plan**

