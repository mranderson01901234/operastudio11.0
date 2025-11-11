"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { Repository, RepositoryDetails, FileTreeItem, FileContent } from "@/lib/github/github-client";

interface GitHubState {
  hasGitHubAccount: boolean;
  account: { id: string; username: string; provider: string } | null;
  repositories: Map<string, Repository>;
  selectedRepository: { owner: string; repo: string } | null;
  sidebarView: "repositories" | "files";
  repositoryDetails: RepositoryDetails | null;
  repositoryFiles: FileTreeItem[] | null;
  activeTab: "code" | "issues" | "pulls" | "actions" | "projects" | "wiki" | "security" | "insights" | "settings";
  loading: boolean;
  loadingRepos: boolean;
  loadingFiles: boolean;
  error: string | null;
}

interface GitHubContextValue {
  state: GitHubState;
  checkGitHubAccount: () => Promise<void>;
  loadRepositories: () => Promise<void>;
  selectRepository: (owner: string, repo: string) => Promise<void>;
  deselectRepository: () => void;
  loadRepositoryDetails: (owner: string, repo: string) => Promise<void>;
  loadRepositoryFiles: (owner: string, repo: string, path?: string, ref?: string) => Promise<void>;
  setActiveTab: (tab: GitHubState["activeTab"]) => void;
}

const GitHubContext = createContext<GitHubContextValue | undefined>(undefined);

const STORAGE_KEY_SELECTED_REPO = "operastudio_github_selected_repo";
const STORAGE_KEY_SIDEBAR_VIEW = "operastudio_github_sidebar_view";
const STORAGE_KEY_ACTIVE_TAB = "operastudio_github_active_tab";
const STORAGE_KEY_REPOSITORIES_CACHE = "operastudio_github_repos_cache";
const STORAGE_KEY_FILES_CACHE_PREFIX = "operastudio_github_files_";
const STORAGE_KEY_FILE_CONTENT_CACHE_PREFIX = "operastudio_github_file_content_";
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour for repositories
const FILES_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes for file trees
const FILE_CONTENT_CACHE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes for file content

interface CachedRepositories {
  repositories: Repository[];
  timestamp: number;
}

interface CachedFiles {
  files: FileTreeItem[];
  timestamp: number;
  path: string;
  ref?: string;
}

interface CachedFileContent {
  content: string;
  sha: string;
  timestamp: number;
  ref?: string;
}

export function GitHubProvider({ children }: { children: ReactNode }) {
  const [hasGitHubAccount, setHasGitHubAccount] = useState(false);
  const [account, setAccount] = useState<{ id: string; username: string; provider: string } | null>(null);
  
  // Initialize repositories from cache
  const [repositories, setRepositories] = useState<Map<string, Repository>>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(STORAGE_KEY_REPOSITORIES_CACHE);
        if (cached) {
          const data: CachedRepositories = JSON.parse(cached);
          // Check if cache is still valid (within 1 hour)
          if (Date.now() - data.timestamp < CACHE_EXPIRY_MS) {
            const reposMap = new Map<string, Repository>();
            data.repositories.forEach((repo) => {
              reposMap.set(repo.full_name, repo);
            });
            return reposMap;
          }
        }
      } catch (e) {
        console.error("Error loading cached repositories:", e);
      }
    }
    return new Map();
  });
  
  // Initialize selected repository from localStorage
  const [selectedRepository, setSelectedRepositoryState] = useState<{ owner: string; repo: string } | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_SELECTED_REPO);
        if (saved) {
          const parsed = JSON.parse(saved);
          // Validate that owner and repo are non-empty strings
          if (parsed.owner && parsed.repo && 
              typeof parsed.owner === "string" && typeof parsed.repo === "string" &&
              parsed.owner.trim() !== "" && parsed.repo.trim() !== "") {
            return { owner: parsed.owner.trim(), repo: parsed.repo.trim() };
          } else {
            // Invalid data, clear it
            console.warn("Invalid repository data in localStorage, clearing:", parsed);
            localStorage.removeItem(STORAGE_KEY_SELECTED_REPO);
          }
        }
      } catch (e) {
        console.error("Error loading saved repository:", e);
        // Clear corrupted data
        try {
          localStorage.removeItem(STORAGE_KEY_SELECTED_REPO);
        } catch {
          // Ignore errors clearing localStorage
        }
      }
    }
    return null;
  });
  
  // Initialize sidebar view from localStorage
  const [sidebarView, setSidebarViewState] = useState<"repositories" | "files">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_SIDEBAR_VIEW);
      if (saved === "repositories" || saved === "files") {
        return saved;
      }
    }
    return "repositories";
  });
  
  const [repositoryDetails, setRepositoryDetails] = useState<RepositoryDetails | null>(null);
  const [repositoryFiles, setRepositoryFiles] = useState<FileTreeItem[] | null>(null);
  
  // Initialize active tab from localStorage
  const [activeTab, setActiveTabState] = useState<GitHubState["activeTab"]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB);
      const validTabs: GitHubState["activeTab"][] = ["code", "issues", "pulls", "actions", "projects", "wiki", "security", "insights", "settings"];
      if (saved && validTabs.includes(saved as GitHubState["activeTab"])) {
        return saved as GitHubState["activeTab"];
      }
    }
    return "code";
  });
  
  const [loading, setLoading] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkGitHubAccount = useCallback(async () => {
    try {
      const response = await fetch("/api/github/account");
      if (response.ok) {
        const data = await response.json();
        setHasGitHubAccount(true);
        setAccount({
          id: data.id,
          username: data.username,
          provider: data.provider,
        });
        return true;
      } else {
        // Not an error - user just hasn't connected GitHub yet
        setHasGitHubAccount(false);
        setAccount(null);
        return false;
      }
    } catch (err) {
      // Silently handle errors - user might not have GitHub connected
      setHasGitHubAccount(false);
      setAccount(null);
      return false;
    }
  }, []);

  const loadRepositories = useCallback(async (forceRefresh: boolean = false) => {
    if (!hasGitHubAccount) {
      return;
    }

    // Check cache first if not forcing refresh
    if (!forceRefresh && typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(STORAGE_KEY_REPOSITORIES_CACHE);
        if (cached) {
          const data: CachedRepositories = JSON.parse(cached);
          // Check if cache is still valid
          if (Date.now() - data.timestamp < CACHE_EXPIRY_MS) {
            const reposMap = new Map<string, Repository>();
            data.repositories.forEach((repo: Repository) => {
              reposMap.set(repo.full_name, repo);
            });
            setRepositories(reposMap);
            return; // Use cached data
          }
        }
      } catch (e) {
        console.error("Error loading cached repositories:", e);
      }
    }

    setLoadingRepos(true);
    setError(null);

    try {
      // Request minimal fields to reduce payload size
      const response = await fetch("/api/github/repos?per_page=100&sort=updated");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to load repositories" }));
        throw new Error(errorData.error || "Failed to load repositories");
      }

      const data = await response.json();
      const reposMap = new Map<string, Repository>();

      if (data.repositories && Array.isArray(data.repositories)) {
        data.repositories.forEach((repo: Repository) => {
          reposMap.set(repo.full_name, repo);
        });
      }

      setRepositories(reposMap);
      
      // Cache repositories
      if (typeof window !== "undefined") {
        try {
          const cache: CachedRepositories = {
            repositories: data.repositories || [],
            timestamp: Date.now(),
          };
          localStorage.setItem(STORAGE_KEY_REPOSITORIES_CACHE, JSON.stringify(cache));
        } catch (e) {
          console.error("Error caching repositories:", e);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load repositories";
      setError(errorMessage);
      console.error("Error loading repositories:", err);
    } finally {
      setLoadingRepos(false);
    }
  }, [hasGitHubAccount]);

  const loadRepositoryDetails = useCallback(async (owner: string, repo: string) => {
    // Validate inputs
    if (!owner || !repo || typeof owner !== "string" || typeof repo !== "string" || owner.trim() === "" || repo.trim() === "") {
      console.error("Invalid repository owner or repo:", { owner, repo });
      setError("Invalid repository: owner and repo must be non-empty strings");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Double-encode repo name to handle dots (Next.js might treat dots as file extensions)
      const encodedOwner = encodeURIComponent(owner);
      const encodedRepo = encodeURIComponent(encodeURIComponent(repo));
      const response = await fetch(`/api/github/repo/${encodedOwner}/${encodedRepo}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to load repository details" }));
        
        // If repository not found, set error but keep selection so user can see the error
        if (response.status === 404) {
          console.warn(`Repository ${owner}/${repo} not found`);
          setError("Repository not found. It may have been deleted or you don't have access.");
          setRepositoryDetails(null);
          // Don't clear selection - let user see the error in the viewer
          return;
        }
        
        throw new Error(errorData.error || "Failed to load repository details");
      }

      const data = await response.json();
      setRepositoryDetails(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load repository details";
      setError(errorMessage);
      console.error("Error loading repository details:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRepositoryFiles = useCallback(async (
    owner: string,
    repo: string,
    path: string = "",
    ref?: string,
    forceRefresh: boolean = false
  ) => {
    // Validate inputs
    if (!owner || !repo || typeof owner !== "string" || typeof repo !== "string" || owner.trim() === "" || repo.trim() === "") {
      console.error("Invalid repository owner or repo:", { owner, repo });
      setError("Invalid repository: owner and repo must be non-empty strings");
      setLoadingFiles(false);
      return;
    }

    // Check cache first if not forcing refresh
    if (!forceRefresh && typeof window !== "undefined") {
      try {
        const cacheKey = `${STORAGE_KEY_FILES_CACHE_PREFIX}${owner}/${repo}/${path || "root"}${ref ? `_${ref}` : ""}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const data: CachedFiles = JSON.parse(cached);
          // Check if cache is still valid
          if (Date.now() - data.timestamp < FILES_CACHE_EXPIRY_MS && data.path === path) {
            setRepositoryFiles(data.files);
            return; // Use cached data
          }
        }
      } catch (e) {
        console.error("Error loading cached files:", e);
      }
    }

    setLoadingFiles(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (path) params.set("path", path);
      if (ref) params.set("ref", ref);

      const query = params.toString();
      // Double-encode repo name to handle dots (Next.js might treat dots as file extensions)
      const encodedOwner = encodeURIComponent(owner);
      const encodedRepo = encodeURIComponent(encodeURIComponent(repo));
      const response = await fetch(
        `/api/github/repo/${encodedOwner}/${encodedRepo}/files${query ? `?${query}` : ""}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to load repository files" }));
        
        // If repository not found, set error but keep selection so user can see the error
        if (response.status === 404) {
          console.warn(`Repository ${owner}/${repo} not found`);
          setError("Repository not found. It may have been deleted or you don't have access.");
          setRepositoryFiles(null);
          // Don't clear selection - let user see the error in the viewer
          return;
        }
        
        throw new Error(errorData.error || "Failed to load repository files");
      }

      const data = await response.json();
      
      // If path is empty, we expect an array of FileTreeItem
      // If path is a file, we get FileContent (but that's handled separately)
      if (Array.isArray(data.files)) {
        setRepositoryFiles(data.files);
        
        // Cache files
        if (typeof window !== "undefined") {
          try {
            const cacheKey = `${STORAGE_KEY_FILES_CACHE_PREFIX}${owner}/${repo}/${path || "root"}${ref ? `_${ref}` : ""}`;
            const cache: CachedFiles = {
              files: data.files,
              timestamp: Date.now(),
              path,
              ref,
            };
            localStorage.setItem(cacheKey, JSON.stringify(cache));
          } catch (e) {
            console.error("Error caching files:", e);
          }
        }
      } else {
        setRepositoryFiles([]);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load repository files";
      setError(errorMessage);
      console.error("Error loading repository files:", err);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const selectRepository = useCallback(async (owner: string, repo: string) => {
    // Validate inputs before proceeding
    if (!owner || !repo || typeof owner !== "string" || typeof repo !== "string" || owner.trim() === "" || repo.trim() === "") {
      console.error("Invalid repository owner or repo:", { owner, repo });
      setError("Invalid repository: owner and repo must be non-empty strings");
      return;
    }

    const repoData = { owner: owner.trim(), repo: repo.trim() };
    setSelectedRepositoryState(repoData);
    setSidebarViewState("files");
    
    // Persist to localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_SELECTED_REPO, JSON.stringify(repoData));
        localStorage.setItem(STORAGE_KEY_SIDEBAR_VIEW, "files");
      } catch (e) {
        console.error("Error saving repository selection:", e);
      }
    }
    
    // Load repository details and files in parallel
    // Catch errors silently - they're already handled in the load functions
    try {
      await Promise.all([
        loadRepositoryDetails(repoData.owner, repoData.repo),
        loadRepositoryFiles(repoData.owner, repoData.repo, ""),
      ]);
    } catch (err) {
      // Errors are already handled in loadRepositoryDetails and loadRepositoryFiles
      // If it's a 404, the selection will be cleared automatically
      console.debug("Error loading repository (may be 404):", err);
    }
  }, [loadRepositoryDetails, loadRepositoryFiles]);

  const deselectRepository = useCallback(() => {
    setSelectedRepositoryState(null);
    setSidebarViewState("repositories");
    setRepositoryDetails(null);
    setRepositoryFiles(null);
    setActiveTabState("code");
    
    // Clear from localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY_SELECTED_REPO);
        localStorage.setItem(STORAGE_KEY_SIDEBAR_VIEW, "repositories");
        localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, "code");
      } catch (e) {
        console.error("Error clearing repository selection:", e);
      }
    }
  }, []);

  const setActiveTab = useCallback((tab: GitHubState["activeTab"]) => {
    setActiveTabState(tab);
    
    // Persist to localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, tab);
      } catch (e) {
        console.error("Error saving active tab:", e);
      }
    }
  }, []);

  // Deferred account check - now triggered by RepositoryList component when user opens GitHub tab
  // This improves initial page load performance by ~200-300ms

  // Restore selected repository on mount if it exists
  useEffect(() => {
    if (selectedRepository && hasGitHubAccount) {
      // Validate repository data before loading
      const { owner, repo } = selectedRepository;
      if (!owner || !repo || typeof owner !== "string" || typeof repo !== "string" || owner.trim() === "" || repo.trim() === "") {
        console.warn("Invalid repository data in localStorage, clearing selection:", { owner, repo });
        deselectRepository();
        return;
      }

      // Only restore if we haven't already loaded (avoid double loading)
      if (!repositoryDetails && !repositoryFiles) {
        // Load repository details and files
        loadRepositoryDetails(owner.trim(), repo.trim()).catch(() => {
          // Error already handled in loadRepositoryDetails
        });
        loadRepositoryFiles(owner.trim(), repo.trim(), "").catch(() => {
          // Error already handled in loadRepositoryFiles
        });
      }
    }
  }, [selectedRepository, hasGitHubAccount, repositoryDetails, repositoryFiles, loadRepositoryDetails, loadRepositoryFiles, deselectRepository]);

  // Load repositories only when GitHub section is opened (lazy loading)
  useEffect(() => {
    if (hasGitHubAccount && sidebarView === "repositories" && repositories.size === 0) {
      loadRepositories();
    }
  }, [hasGitHubAccount, sidebarView, repositories.size, loadRepositories]);

  const value: GitHubContextValue = {
    state: {
      hasGitHubAccount,
      account,
      repositories,
      selectedRepository,
      sidebarView,
      repositoryDetails,
      repositoryFiles,
      activeTab,
      loading,
      loadingRepos,
      loadingFiles,
      error,
    },
    checkGitHubAccount,
    loadRepositories,
    selectRepository,
    deselectRepository,
    loadRepositoryDetails,
    loadRepositoryFiles,
    setActiveTab,
  };

  return <GitHubContext.Provider value={value}>{children}</GitHubContext.Provider>;
}

export function useGitHub() {
  const context = useContext(GitHubContext);
  if (context === undefined) {
    throw new Error("useGitHub must be used within GitHubProvider");
  }
  return context;
}

// Helper function to detect language from file path
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    md: "markdown",
    sql: "sql",
    dockerfile: "dockerfile",
  };
  return languageMap[ext] || "plaintext";
}

