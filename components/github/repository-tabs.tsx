"use client";

import React from "react";
import { Code, AlertCircle, GitPullRequest, Play, FolderKanban, Book, Shield, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface RepositoryTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "code", label: "Code", icon: Code },
  { id: "issues", label: "Issues", icon: AlertCircle },
  { id: "pulls", label: "Pull requests", icon: GitPullRequest },
  { id: "actions", label: "Actions", icon: Play },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "wiki", label: "Wiki", icon: Book },
  { id: "security", label: "Security", icon: Shield },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export function RepositoryTabs({ activeTab, onTabChange }: RepositoryTabsProps) {
  return (
    <div className="border-b border-border bg-background github-tabs">
      <div className="px-6 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 border-transparent transition-colors",
                "hover:text-foreground",
                isActive
                  ? "text-orange-500 border-orange-500"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

