"use client";

import React from "react";
import { Star, GitBranch, Eye, GitFork, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RepositoryDetails } from "@/lib/github/github-client";
import { cn } from "@/lib/utils";

interface RepositoryHeaderProps {
  repository: { owner: string; repo: string };
  details: RepositoryDetails | null;
}

export function RepositoryHeader({ repository, details }: RepositoryHeaderProps) {
  const handleClone = () => {
    if (details?.clone_url) {
      navigator.clipboard.writeText(details.clone_url);
      // TODO: Show toast notification
    }
  };

  return (
    <div className="border-b border-border bg-background github-repo-header">
      <div className="px-6 py-4">
        {/* Repository name */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-muted-foreground">{repository.owner}</span>
          <span className="text-sm text-muted-foreground">/</span>
          <h1 className="text-xl font-semibold">{repository.repo}</h1>
          {details?.private && (
            <span className="px-2 py-0.5 text-xs font-medium bg-muted rounded">
              Private
            </span>
          )}
        </div>

        {/* Description */}
        {details?.description && (
          <p className="text-sm text-muted-foreground mb-4">{details.description}</p>
        )}

        {/* Stats and actions */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Stats */}
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Star className="w-4 h-4" />
              <span>{details?.stargazers_count || 0}</span>
            </button>
            <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <GitFork className="w-4 h-4" />
              <span>{details?.forks_count || 0}</span>
            </button>
            <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Eye className="w-4 h-4" />
              <span>{details?.watchers_count || 0}</span>
            </button>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <GitBranch className="w-4 h-4" />
              <span>{details?.default_branch || "main"}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClone}
              className="flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Clone
            </Button>
            {details?.html_url && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(details.html_url, "_blank")}
              >
                View on GitHub
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

