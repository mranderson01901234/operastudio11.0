"use client";

import React from "react";
import { useGitHub } from "@/contexts/github-context";
import { FolderKanban } from "lucide-react";

export function ProjectsTab() {
  const { state } = useGitHub();
  const { selectedRepository } = state;

  if (!selectedRepository) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a repository to view projects</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border p-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage project boards for this repository
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <FolderKanban className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-2">No projects found</p>
          <p className="text-xs text-muted-foreground">
            Projects help you organize and prioritize your work
          </p>
        </div>
      </div>
    </div>
  );
}

