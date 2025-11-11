"use client";

import React, { useEffect, useState } from "react";
import { useGitHub } from "@/contexts/github-context";
import { GitPullRequest, Search, Plus, Loader2, CheckCircle2, XCircle, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface PullRequest {
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed" | "merged";
  head: { ref: string };
  base: { ref: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string };
  comments?: number;
  review_comments?: number;
}

export function PullRequestsTab() {
  const { state } = useGitHub();
  const { selectedRepository } = state;
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!selectedRepository) return;

    const loadPullRequests = async () => {
      setLoading(true);
      setError(null);
      try {
        const encodedOwner = encodeURIComponent(selectedRepository.owner);
        const encodedRepo = encodeURIComponent(encodeURIComponent(selectedRepository.repo));
        const response = await fetch(
          `/api/github/repo/${encodedOwner}/${encodedRepo}/pulls?state=${filter}`
        );

        if (!response.ok) {
          throw new Error("Failed to load pull requests");
        }

        const data = await response.json();
        setPullRequests(data.pulls || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load pull requests");
        console.error("Error loading pull requests:", err);
      } finally {
        setLoading(false);
      }
    };

    loadPullRequests();
  }, [selectedRepository, filter]);

  const filteredPRs = pullRequests.filter((pr) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      pr.title.toLowerCase().includes(query) ||
      pr.body?.toLowerCase().includes(query) ||
      pr.number.toString().includes(query) ||
      pr.head.ref.toLowerCase().includes(query)
    );
  });

  const getStateIcon = (state: string) => {
    switch (state) {
      case "open":
        return <GitPullRequest className="w-5 h-5 text-green-500" />;
      case "closed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "merged":
        return <GitMerge className="w-5 h-5 text-purple-500" />;
      default:
        return <GitPullRequest className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStateLabel = (state: string) => {
    switch (state) {
      case "open":
        return "Open";
      case "closed":
        return "Closed";
      case "merged":
        return "Merged";
      default:
        return state;
    }
  };

  if (!selectedRepository) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a repository to view pull requests</p>
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
            New Pull Request
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search pull requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Pull requests list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : filteredPRs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GitPullRequest className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No pull requests found matching your search" : "No pull requests found"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredPRs.map((pr) => (
              <div
                key={pr.number}
                className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => window.open(pr.html_url, "_blank")}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getStateIcon(pr.state)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold hover:text-primary transition-colors">
                        {pr.title}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {getStateLabel(pr.state)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                      <span>#{pr.number}</span>
                      <span>
                        {pr.state === "open" ? "opened" : pr.state === "merged" ? "merged" : "closed"}{" "}
                        {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true })}
                      </span>
                      <span>by {pr.user.login}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">
                        {pr.head.ref} → {pr.base.ref}
                      </span>
                      {pr.comments && pr.comments > 0 && (
                        <span className="flex items-center gap-1">
                          💬 {pr.comments}
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

