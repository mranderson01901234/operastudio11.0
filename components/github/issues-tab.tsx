"use client";

import React, { useEffect, useState } from "react";
import { useGitHub } from "@/contexts/github-context";
import { AlertCircle, Search, Filter, Plus, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Issue {
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed";
  labels: Array<{ name: string; color?: string }>;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url?: string };
  comments?: number;
}

export function IssuesTab() {
  const { state } = useGitHub();
  const { selectedRepository } = state;
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!selectedRepository) return;

    const loadIssues = async () => {
      setLoading(true);
      setError(null);
      try {
        const encodedOwner = encodeURIComponent(selectedRepository.owner);
        const encodedRepo = encodeURIComponent(encodeURIComponent(selectedRepository.repo));
        const response = await fetch(
          `/api/github/repo/${encodedOwner}/${encodedRepo}/issues?state=${filter}`
        );

        if (!response.ok) {
          throw new Error("Failed to load issues");
        }

        const data = await response.json();
        setIssues(data.issues || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load issues");
        console.error("Error loading issues:", err);
      } finally {
        setLoading(false);
      }
    };

    loadIssues();
  }, [selectedRepository, filter]);

  const filteredIssues = issues.filter((issue) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      issue.title.toLowerCase().includes(query) ||
      issue.body?.toLowerCase().includes(query) ||
      issue.number.toString().includes(query)
    );
  });

  if (!selectedRepository) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a repository to view issues</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with filters and search */}
      <div className="border-b border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant={filter === "open" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("open")}
            >
              Open
            </Button>
            <Button
              variant={filter === "closed" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("closed")}
            >
              Closed
            </Button>
            <Button
              variant={filter === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
          </div>
          <Button size="sm" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Issue
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search issues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No issues found matching your search" : "No issues found"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredIssues.map((issue) => (
              <div
                key={issue.number}
                className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => window.open(issue.html_url, "_blank")}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {issue.state === "open" ? (
                      <AlertCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-purple-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold hover:text-primary transition-colors">
                        {issue.title}
                      </h3>
                      {issue.labels.map((label) => (
                        <Badge
                          key={label.name}
                          variant="secondary"
                          className="text-xs"
                          style={label.color ? { backgroundColor: `#${label.color}20`, color: `#${label.color}` } : undefined}
                        >
                          {label.name}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>#{issue.number}</span>
                      <span>
                        {issue.state === "open" ? "opened" : "closed"}{" "}
                        {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}
                      </span>
                      <span>by {issue.user.login}</span>
                      {issue.comments > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {issue.comments}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

