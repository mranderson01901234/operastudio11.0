"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Loader2, Github, Search } from "lucide-react";
import { useGitHub } from "@/contexts/github-context";
import { useFileSystem } from "@/contexts/filesystem-context";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Repository } from "@/lib/github/github-client";

export function RepositoryList() {
  const { state, selectRepository, loadRepositories, checkGitHubAccount } = useGitHub();
  const { selectedTool, setSelectedTool } = useFileSystem();
  const { repositories, selectedRepository, loadingRepos, error, hasGitHubAccount } = state;
  const [searchQuery, setSearchQuery] = React.useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkGitHubAccount();
  }, [checkGitHubAccount]);

  // Repositories are now lazy-loaded when GitHub section is opened (handled in context)
  // Only load if we have account but no repositories yet
  useEffect(() => {
    if (hasGitHubAccount && repositories.size === 0 && !loadingRepos) {
      loadRepositories();
    }
  }, [hasGitHubAccount, repositories.size, loadingRepos, loadRepositories]);

  // Filter repositories based on search query
  const filteredRepositories = React.useMemo(() => {
    if (!searchQuery) {
      return Array.from(repositories.values());
    }
    const query = searchQuery.toLowerCase();
    return Array.from(repositories.values()).filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) ||
        repo.full_name.toLowerCase().includes(query) ||
        (repo.description && repo.description.toLowerCase().includes(query))
    );
  }, [repositories, searchQuery]);

  if (!hasGitHubAccount) {
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
        <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-4">
          <Github className="w-12 h-12 text-sidebar-foreground/30" />
          <div className="text-sm text-sidebar-foreground/70 text-center">
            Connect GitHub to view repositories
          </div>
          <Button
            onClick={async () => {
              try {
              const response = await fetch("/api/github/connect");
                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({ error: "Failed to connect" }));
                  console.error("GitHub connect error:", errorData);
                  alert(`Failed to connect to GitHub: ${errorData.error || response.statusText}`);
                  return;
                }
                const data = await response.json();
                if (!data.authUrl) {
                  console.error("No authUrl in response:", data);
                  alert("Failed to get GitHub authentication URL");
                  return;
                }
                // Redirect to GitHub OAuth
                window.location.href = data.authUrl;
              } catch (error) {
                console.error("Error connecting to GitHub:", error);
                alert(`Error connecting to GitHub: ${error instanceof Error ? error.message : "Unknown error"}`);
              }
            }}
            size="sm"
            className="w-full"
          >
            Connect GitHub
          </Button>
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
          <div className="text-sm text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-sidebar-border flex-shrink-0 space-y-2">
        <SidebarMenuButton
          size="default"
          onClick={() => setSelectedTool("chat")}
          className="w-full justify-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Navigation</span>
        </SidebarMenuButton>

        <div className="text-xs font-medium text-sidebar-foreground/70 px-2 pt-2">
          GitHub Repositories
        </div>

        {/* Search */}
        <div className="px-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-sidebar-foreground/50" />
            <Input
              type="text"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm bg-sidebar-accent/50 border-sidebar-border"
            />
          </div>
        </div>
      </div>

      {/* Repository list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto p-2 premium-scrollbar"
      >
        {loadingRepos && repositories.size === 0 ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="ml-2 text-sm text-sidebar-foreground/70">
              Loading repositories...
            </span>
          </div>
        ) : filteredRepositories.length === 0 ? (
          <div className="p-4 text-sm text-sidebar-foreground/70 text-center">
            {searchQuery ? "No repositories found" : "No repositories"}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredRepositories.map((repo) => (
              <RepositoryListItem
                key={repo.full_name}
                repository={repo}
                isSelected={
                  selectedRepository?.owner === repo.full_name.split("/")[0] &&
                  selectedRepository?.repo === repo.full_name.split("/")[1]
                }
                onClick={() => {
                  const [owner, repoName] = repo.full_name.split("/");
                  // Ensure GitHub tool is selected
                  if (selectedTool !== "github") {
                    setSelectedTool("github");
                  }
                  selectRepository(owner, repoName);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface RepositoryListItemProps {
  repository: Repository;
  isSelected: boolean;
  onClick: () => void;
}

function RepositoryListItem({ repository, isSelected, onClick }: RepositoryListItemProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-2 rounded-md cursor-pointer hover:bg-sidebar-accent transition-colors",
        isSelected && "bg-sidebar-accent"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <Github className="w-4 h-4 text-sidebar-foreground/70 flex-shrink-0" />
        <span
          className={cn(
            "text-sm font-medium truncate flex-1",
            isSelected && "font-semibold"
          )}
        >
          {repository.name}
        </span>
        {repository.private && (
          <span className="text-xs text-sidebar-foreground/50 flex-shrink-0">
            Private
          </span>
        )}
      </div>
      {repository.description && (
        <p className="text-xs text-sidebar-foreground/60 truncate ml-6">
          {repository.description}
        </p>
      )}
      <div className="flex items-center gap-3 ml-6 text-xs text-sidebar-foreground/50">
        {repository.language && (
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            {repository.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25zm0 2.445L6.615 5.5a.75.75 0 01-.564.41l-3.097.45 2.24 2.184a.75.75 0 01.216.664l-.528 3.084 2.769-1.456a.75.75 0 01.698 0l2.77 1.456-.53-3.084a.75.75 0 01.216-.664l2.24-2.183-3.096-.45a.75.75 0 01-.564-.41L8 2.694v.001z" />
          </svg>
          {repository.stargazers_count}
        </span>
        <span>
          Updated {formatDistanceToNow(new Date(repository.updated_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

