"use client";

import React from "react";
import { useGitHub } from "@/contexts/github-context";
import { RepositoryHeader } from "./repository-header";
import { RepositoryTabs } from "./repository-tabs";
import { CodeTab } from "./code-tab";
import { Loader2 } from "lucide-react";

export function RepositoryViewer() {
  const { state, setActiveTab } = useGitHub();
  const { selectedRepository, repositoryDetails, activeTab, loading, error } = state;

  if (!selectedRepository) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Select a repository to view</p>
        </div>
      </div>
    );
  }

  // Show error if there is one
  if (error && !repositoryDetails) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center text-muted-foreground max-w-md p-6">
          <p className="text-sm text-destructive mb-2">Error loading repository</p>
          <p className="text-xs">{error}</p>
        </div>
      </div>
    );
  }

  if (loading && !repositoryDetails) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background github-repo-viewer">
      {/* Repository Header */}
      <RepositoryHeader
        repository={selectedRepository}
        details={repositoryDetails}
      />

      {/* Tab Navigation */}
      <RepositoryTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "code" && <CodeTab />}
        {activeTab === "issues" && (
          <div className="text-muted-foreground">Issues tab - Coming soon</div>
        )}
        {activeTab === "pulls" && (
          <div className="text-muted-foreground">Pull Requests tab - Coming soon</div>
        )}
        {activeTab === "actions" && (
          <div className="text-muted-foreground">Actions tab - Coming soon</div>
        )}
        {activeTab === "projects" && (
          <div className="text-muted-foreground">Projects tab - Coming soon</div>
        )}
        {activeTab === "wiki" && (
          <div className="text-muted-foreground">Wiki tab - Coming soon</div>
        )}
        {activeTab === "security" && (
          <div className="text-muted-foreground">Security tab - Coming soon</div>
        )}
        {activeTab === "insights" && (
          <div className="text-muted-foreground">Insights tab - Coming soon</div>
        )}
        {activeTab === "settings" && (
          <div className="text-muted-foreground">Settings tab - Coming soon</div>
        )}
      </div>
    </div>
  );
}

