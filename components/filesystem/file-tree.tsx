"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronDown, Folder, File, Loader2, ArrowLeft } from "lucide-react";
import { useFileSystem } from "@/contexts/filesystem-context";
import { useFileEditor } from "@/contexts/file-editor-context";
import { cn } from "@/lib/utils";
import { SidebarMenuButton } from "@/components/ui/sidebar";

interface FileTreeItem {
  path: string;
  type: "file" | "directory";
  size: number;
  mtime: string;
}

interface FileTreeNode {
  item: FileTreeItem;
  children?: FileTreeNode[];
  expanded?: boolean;
  loaded?: boolean;
}

export function FileTree() {
  const { cwd, selection, setCwd, setSelection, sessionStatus, setSelectedTool } = useFileSystem();
  const { openFile } = useFileEditor();
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Resolve home directory (~) to actual path
  // The API will handle ~ resolution, so we just pass it through
  const resolvePath = useCallback((path: string): string => {
    return path;
  }, []);

  // Load directory contents
  const loadDirectory = useCallback(async (dirPath: string, depth: number = 1) => {
    if (sessionStatus !== "connected") {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resolvedPath = resolvePath(dirPath);
      const response = await fetch(
        `/api/filesystem/list?path=${encodeURIComponent(resolvedPath)}&depth=${depth}&includeHidden=false`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load directory: ${response.status}`);
      }

      const data = await response.json();
      return data.items as FileTreeItem[];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load directory";
      setError(errorMessage);
      console.error("Error loading directory:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [sessionStatus, resolvePath]);

  // Load root directory on mount and when cwd changes
  useEffect(() => {
    if (sessionStatus === "connected") {
      // Clear expanded paths when cwd changes to ensure directories start collapsed
      setExpandedPaths(new Set());
      const rootPath = cwd || "~";
      loadDirectory(rootPath, 1).then((items) => {
        if (items) {
          setTree(
            items.map((item) => ({
              item,
              expanded: false,
              loaded: false,
            }))
          );
        }
      });
    } else {
      setTree([]);
      setExpandedPaths(new Set());
    }
  }, [sessionStatus, cwd, loadDirectory]);

  // Toggle directory expansion
  const toggleExpand = useCallback(
    async (node: FileTreeNode) => {
      if (node.item.type !== "directory") {
        return;
      }

      const path = node.item.path;
      const isExpanded = expandedPaths.has(path);

      if (isExpanded) {
        // Collapse
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      } else {
        // Expand - load children if not already loaded
        setExpandedPaths((prev) => new Set(prev).add(path));

        if (!node.loaded) {
          const children = await loadDirectory(path, 1);
          if (children) {
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
                    return { ...n, children: updateNode(n.children) };
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
    [expandedPaths, loadDirectory]
  );

  // Handle item click
  const handleItemClick = useCallback(
    async (item: FileTreeItem) => {
      if (item.type === "directory") {
        // Click folder: Set cwd, clear selection
        setCwd(item.path);
        setSelection(null);
        // Expand/collapse
        const node = findNode(tree, item.path);
        if (node) {
          toggleExpand(node);
        }
      } else {
        // Click file: Set cwd to parent, set selection to file, and open in editor
        const parentPath = item.path.split("/").slice(0, -1).join("/") || "/";
        setCwd(parentPath);
        setSelection(item.path);
        // Open file in editor
        await openFile(item.path);
      }
    },
    [tree, setCwd, setSelection, toggleExpand, openFile]
  );

  // Find node in tree
  const findNode = (nodes: FileTreeNode[], path: string): FileTreeNode | null => {
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
  };

  // Render tree node
  const renderNode = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    const { item } = node;
    const isDirectory = item.type === "directory";
    const isExpanded = expandedPaths.has(item.path);
    const isSelected = selection === item.path || (isDirectory && cwd === item.path);

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
            <div className="w-4" /> // Spacer for files
          )}
          {isDirectory ? (
            <Folder className="w-4 h-4 text-blue-500" />
          ) : (
            <File className="w-4 h-4 text-gray-500" />
          )}
          <span className="text-sm truncate flex-1">{item.path.split("/").pop()}</span>
        </div>
        {isDirectory && isExpanded && node.children && (
          <div>{node.children.map((child) => renderNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  if (sessionStatus !== "connected") {
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 border-b border-sidebar-border flex-shrink-0">
          <SidebarMenuButton
            size="default"
            onClick={() => setSelectedTool("chat")}
            className="w-full justify-start mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </SidebarMenuButton>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-sm text-sidebar-foreground/70 text-center">
            Connect to local environment to view file system
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 border-b border-sidebar-border flex-shrink-0">
          <SidebarMenuButton
            size="default"
            onClick={() => setSelectedTool("chat")}
            className="w-full justify-start mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </SidebarMenuButton>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-sm text-red-500">
            Error: {error}
          </div>
        </div>
      </div>
    );
  }

  // Get parent directory for navigation (client-side)
  const getParentDirectory = useCallback(() => {
    if (!cwd || cwd === "~") {
      return null; // Already at root/home
    }

    // Handle absolute paths
    const pathParts = cwd.split("/").filter(Boolean);
    
    // If we're at root level, return null
    if (pathParts.length === 0) {
      return null;
    }

    // If we're one level deep from root, return "/"
    if (pathParts.length === 1 && cwd.startsWith("/")) {
      return "/";
    }

    // Remove last part to get parent
    const parentParts = pathParts.slice(0, -1);
    
    // If no parent parts, we're at root
    if (parentParts.length === 0) {
      return cwd.startsWith("/") ? "/" : "~";
    }

    // Reconstruct parent path
    const parentPath = cwd.startsWith("/") 
      ? "/" + parentParts.join("/")
      : parentParts.join("/");

    // Check if parent is likely home directory (common patterns)
    // We'll use a heuristic: if parent path matches common home directory patterns
    const commonHomePatterns = [
      /^\/home\/[^\/]+$/,
      /^\/Users\/[^\/]+$/,
      /^\/home\/[^\/]+$/,
    ];
    
    if (commonHomePatterns.some(pattern => pattern.test(parentPath))) {
      return "~";
    }

    return parentPath;
  }, [cwd]);

  const parentDir = getParentDirectory();
  const isAtRoot = !parentDir || cwd === "~" || cwd === "/";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with back buttons */}
      <div className="p-2 border-b border-sidebar-border flex-shrink-0 space-y-2">
        {/* Back to navigation button */}
        <SidebarMenuButton
          size="default"
          onClick={() => setSelectedTool("chat")}
          className="w-full justify-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Navigation</span>
        </SidebarMenuButton>
        
        {/* Back to parent directory button (only show if not at root) */}
        {!isAtRoot && parentDir && (
          <SidebarMenuButton
            size="default"
            onClick={() => {
              setCwd(parentDir);
              setSelection(null);
            }}
            className="w-full justify-start"
            variant="outline"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Up Directory</span>
          </SidebarMenuButton>
        )}
        
        <div className="text-xs font-medium text-sidebar-foreground/70 px-2 pt-2">
          File System
        </div>
        <div className="text-xs text-sidebar-foreground/50 truncate mt-1 px-2">
          {cwd || "~"}
        </div>
      </div>
      {/* File tree content */}
      <div className="flex-1 overflow-auto p-2 premium-scrollbar">
        {loading && tree.length === 0 ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="ml-2 text-sm text-sidebar-foreground/70">Loading...</span>
          </div>
        ) : tree.length === 0 ? (
          <div className="p-4 text-sm text-sidebar-foreground/70 text-center">
            No files found
          </div>
        ) : (
          tree.map((node) => renderNode(node))
        )}
      </div>
    </div>
  );
}

