"use client";

import React from "react";
import { useGitHub } from "@/contexts/github-context";
import { BarChart3, GitBranch, Users, Calendar } from "lucide-react";

export function InsightsTab() {
  const { state } = useGitHub();
  const { selectedRepository, repositoryDetails } = state;

  if (!selectedRepository) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a repository to view insights</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border p-4">
        <h2 className="text-lg font-semibold">Insights</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Repository statistics and analytics
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Default Branch</h3>
            </div>
            <p className="text-2xl font-bold">{repositoryDetails?.default_branch || "main"}</p>
          </div>

          <div className="p-4 border border-border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Open Issues</h3>
            </div>
            <p className="text-2xl font-bold">{repositoryDetails?.open_issues_count || 0}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 border border-border rounded-lg">
            <h3 className="text-sm font-semibold mb-2">Repository Statistics</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Stars</span>
                <span className="font-semibold text-foreground">{repositoryDetails?.stargazers_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Forks</span>
                <span className="font-semibold text-foreground">{repositoryDetails?.forks_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Watchers</span>
                <span className="font-semibold text-foreground">{repositoryDetails?.watchers_count || 0}</span>
              </div>
            </div>
          </div>

          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">
              Advanced analytics and graphs coming soon
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

