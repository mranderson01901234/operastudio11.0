"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronDown, Folder, File, Loader2, ArrowLeft, GitBranch } from "lucide-react";
import { useGitHub } from "@/contexts/github-context";
import { useFileEditor } from "@/contexts/file-editor-context";
import { cn } from "@/lib/utils";
import { base64ToUtf8 } from "@/lib/utils/base64";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { FileTreeItem } from "@/lib/github/github-client";

// Helper function to invalidate file caches
function invalidateFileCache(owner: string, repo: string, path: string) {
  if (typeof window === "undefined") return;
  
  try {
    // Invalidate file content cache
    const fileCacheKey = `operastudio_github_file_content_${owner}/${repo}/${path}`;
    localStorage.removeItem(fileCacheKey);
    
    // Invalidate parent directory cache
    const dirPath = path.split("/").slice(0, -1).join("/") || "root";
    const dirCacheKey = `operastudio_github_files_${owner}/${repo}/${dirPath}`;
    localStorage.removeItem(dirCacheKey);
    
    // Also invalidate root cache if it's a root file
    if (path.split("/").length === 1) {
      const rootCacheKey = `operastudio_github_files_${owner}/${repo}/root`;
      localStorage.removeItem(rootCacheKey);
    }
  } catch (e) {
    console.error("Error invalidating cache:", e);
  }
}

interface FileTreeNode {
  item: FileTreeItem;
  children?: FileTreeNode[];
  expanded?: boolean;
  loaded?: boolean;
}

export function RepositoryFileTree() {
  const {
    state,
    loadRepositoryFiles,
    deselectRepository,
  } = useGitHub();
  const { openFile } = useFileEditor();
  const { selectedRepository, repositoryFiles, loadingFiles, error } = state;
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Listen for file update events to invalidate cache
  useEffect(() => {
    const handleFileUpdate = (event: CustomEvent<{ owner: string; repo: string; path: string }>) => {
      const { owner, repo, path } = event.detail;
      if (selectedRepository && owner === selectedRepository.owner && repo === selectedRepository.repo) {
        invalidateFileCache(owner, repo, path);
        // Reload files if this affects the current view
        if (path === "" || repositoryFiles) {
          loadRepositoryFiles(owner, repo, "", undefined, true);
        }
      }
    };

    window.addEventListener("github-file-updated", handleFileUpdate as EventListener);
    return () => {
      window.removeEventListener("github-file-updated", handleFileUpdate as EventListener);
    };
  }, [selectedRepository, repositoryFiles, loadRepositoryFiles]);

  // Load root files when repository is selected
  useEffect(() => {
    if (selectedRepository && repositoryFiles) {
      setTree(
        repositoryFiles.map((item) => ({
          item,
          expanded: false,
          loaded: false,
        }))
      );
    } else {
      setTree([]);
      setExpandedPaths(new Set());
    }
  }, [selectedRepository, repositoryFiles]);

  // Load directory contents with caching
  const loadDirectory = useCallback(
    async (dirPath: string): Promise<FileTreeItem[]> => {
      if (!selectedRepository) return [];

      // Check cache first
      const cacheKey = `operastudio_github_files_${selectedRepository.owner}/${selectedRepository.repo}/${dirPath}`;
      if (typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const data: { files: FileTreeItem[]; timestamp: number; path: string } = JSON.parse(cached);
            // Check if cache is still valid (5 minutes)
            if (Date.now() - data.timestamp < 5 * 60 * 1000 && data.path === dirPath) {
              return data.files;
            }
          }
        } catch (e) {
          console.error("Error loading cached directory:", e);
        }
      }

      try {
        // Double-encode repo name to handle dots (Next.js might treat dots as file extensions)
        const encodedOwner = encodeURIComponent(selectedRepository.owner);
        const encodedRepo = encodeURIComponent(encodeURIComponent(selectedRepository.repo));
        const response = await fetch(
          `/api/github/repo/${encodedOwner}/${encodedRepo}/files?path=${encodeURIComponent(dirPath)}`
        );

        if (!response.ok) {
          throw new Error("Failed to load directory");
        }

        const data = await response.json();
        const files = data.files || [];
        
        // Cache the result
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({
              files,
              timestamp: Date.now(),
              path: dirPath,
            }));
          } catch (e) {
            console.error("Error caching directory:", e);
          }
        }
        
        return files;
      } catch (err) {
        console.error("Error loading directory:", err);
        return [];
      }
    },
    [selectedRepository]
  );

  // Find node in tree
  const findNode = useCallback(
    (nodes: FileTreeNode[], path: string): FileTreeNode | null => {
      for (const node of nodes) {
        if (node.item.path === path) {
          return node;
        }
        if (node.children) {
          const found = findNode(node.children, path);
          if (found) return found;
        }
      }
      return null;
    },
    []
  );

  // Toggle directory expansion
  const toggleExpand = useCallback(
    async (node: FileTreeNode) => {
      if (node.item.type !== "dir") {
        return;
      }

      const path = node.item.path;

      if (expandedPaths.has(path)) {
        // Collapse
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      } else {
        // Expand - load children if not loaded
        setExpandedPaths((prev) => new Set(prev).add(path));

        if (!node.loaded && selectedRepository) {
          const children = await loadDirectory(path);
          if (children && children.length > 0) {
            setTree((prevTree) => {
              const updateNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
                return nodes.map((n) => {
                  if (n.item.path === path) {
                    return {
                      ...n,
                      children: children.map((item) => ({
                        item,
                        expanded: false,
                        loaded: false,
                      })),
                      loaded: true,
                    };
                  }
                  if (n.children) {
                    return {
                      ...n,
                      children: updateNode(n.children),
                    };
                  }
                  return n;
                });
              };
              return updateNode(prevTree);
            });
          }
        }
      }
    },
    [expandedPaths, selectedRepository, loadDirectory]
  );

  // Handle file/directory click
  const handleItemClick = useCallback(
    async (item: FileTreeItem) => {
      if (item.type === "file") {
        // Open file in editor
        if (!selectedRepository) return;

        setSelectedPath(item.path);

        try {
          // Check cache first for file content
          const fileCacheKey = `operastudio_github_file_content_${selectedRepository.owner}/${selectedRepository.repo}/${item.path}`;
          let content: string | null = null;
          let cachedSha: string | null = null;
          
          if (typeof window !== "undefined") {
            try {
              const cached = localStorage.getItem(fileCacheKey);
              if (cached) {
                const cacheData: { content: string; sha: string; timestamp: number } = JSON.parse(cached);
                // Check if cache is still valid (10 minutes)
                if (Date.now() - cacheData.timestamp < 10 * 60 * 1000) {
                  content = cacheData.content;
                  cachedSha = cacheData.sha;
                }
              }
            } catch (e) {
              console.error("Error loading cached file content:", e);
            }
          }

          // Fetch file content if not cached
          if (!content) {
            // Double-encode repo name to handle dots (Next.js might treat dots as file extensions)
            const encodedOwner = encodeURIComponent(selectedRepository.owner);
            const encodedRepo = encodeURIComponent(encodeURIComponent(selectedRepository.repo));
            const response = await fetch(
              `/api/github/repo/${encodedOwner}/${encodedRepo}/file?path=${encodeURIComponent(item.path)}`
            );

            if (!response.ok) {
              throw new Error("Failed to load file");
            }

            const data = await response.json();
            // Decode base64 content to UTF-8
            content = base64ToUtf8(data.content);
            
            // Cache the file content
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem(fileCacheKey, JSON.stringify({
                  content,
                  sha: data.sha,
                  timestamp: Date.now(),
                }));
              } catch (e) {
                console.error("Error caching file content:", e);
              }
            }
          }

          // Detect language from file extension
          const ext = item.path.split(".").pop()?.toLowerCase() || "";
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
          const language = languageMap[ext] || "plaintext";

          // Open in file editor with content
          await openFile(
            `github://${selectedRepository.owner}/${selectedRepository.repo}/${item.path}`,
            content,
            language
          );
        } catch (err) {
          console.error("Error opening file:", err);
        }
      } else {
        // Toggle directory expansion
        const node = findNode(tree, item.path);
        if (node) {
          await toggleExpand(node);
        }
      }
    },
    [selectedRepository, openFile, tree, toggleExpand, findNode]
  );

  // Render tree node
  const renderNode = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    const { item } = node;
    const isDirectory = item.type === "dir";
    const isExpanded = expandedPaths.has(item.path);
    const isSelected = selectedPath === item.path;

    return (
      <div key={item.path} className="select-none">
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer hover:bg-sidebar-accent",
            isSelected && "bg-sidebar-accent",
            level > 0 && "ml-4"
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => handleItemClick(item)}
        >
          {isDirectory ? (
            <button
              className="flex items-center justify-center w-4 h-4 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}
          {isDirectory ? (
            <Folder className="w-4 h-4 text-blue-500" />
          ) : (
            <File className="w-4 h-4 text-gray-500" />
          )}
          <span className="text-sm truncate flex-1">{item.name}</span>
        </div>
        {isDirectory && isExpanded && node.children && (
          <div>{node.children.map((child) => renderNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  if (!selectedRepository) {
    return null;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-sidebar-border flex-shrink-0 space-y-2">
        <SidebarMenuButton
          size="default"
          onClick={() => deselectRepository()}
          className="w-full justify-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Repositories</span>
        </SidebarMenuButton>

        <div className="text-xs font-medium text-sidebar-foreground/70 px-2">
          {selectedRepository.owner}/{selectedRepository.repo}
        </div>

        {/* Branch selector placeholder */}
        <div className="px-2">
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/50">
            <GitBranch className="w-3 h-3" />
            <span>main</span>
          </div>
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-auto p-2 premium-scrollbar">
        {loadingFiles && tree.length === 0 ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="ml-2 text-sm text-sidebar-foreground/70">
              Loading files...
            </span>
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-500">Error: {error}</div>
        ) : tree.length === 0 ? (
          <div className="p-4 text-sm text-sidebar-foreground/70 text-center">
            No files found
          </div>
        ) : (
          <div>{tree.map((node) => renderNode(node))}</div>
        )}
      </div>
    </div>
  );
}

