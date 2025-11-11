"use client";

import React, { useEffect, useState } from "react";
import { useGitHub } from "@/contexts/github-context";
import { Play, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface WorkflowRun {
  id: number;
  name: string;
  status: "completed" | "in_progress" | "queued" | "waiting";
  conclusion: "success" | "failure" | "cancelled" | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  head_branch: string;
  event: string;
}

export function ActionsTab() {
  const { state } = useGitHub();
  const { selectedRepository } = state;
  const [workflows, setWorkflows] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedRepository) return;

    const loadWorkflows = async () => {
      setLoading(true);
      setError(null);
      try {
        const encodedOwner = encodeURIComponent(selectedRepository.owner);
        const encodedRepo = encodeURIComponent(encodeURIComponent(selectedRepository.repo));
        const response = await fetch(
          `/api/github/repo/${encodedOwner}/${encodedRepo}/actions/runs`
        );

        if (!response.ok) {
          throw new Error("Failed to load workflow runs");
        }

        const data = await response.json();
        setWorkflows(data.workflows || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load workflow runs");
        console.error("Error loading workflows:", err);
      } finally {
        setLoading(false);
      }
    };

    loadWorkflows();
  }, [selectedRepository]);

  const getStatusIcon = (status: string, conclusion: string | null) => {
    if (status === "in_progress" || status === "queued" || status === "waiting") {
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    }
    if (conclusion === "success") {
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    }
    if (conclusion === "failure") {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    if (conclusion === "cancelled") {
      return <XCircle className="w-5 h-5 text-gray-500" />;
    }
    return <Clock className="w-5 h-5 text-yellow-500" />;
  };

  if (!selectedRepository) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a repository to view workflow runs</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border p-4">
        <h2 className="text-lg font-semibold">Workflow Runs</h2>
        <p className="text-sm text-muted-foreground mt-1">
          View and manage GitHub Actions workflow runs
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Play className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">No workflow runs found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => window.open(workflow.html_url, "_blank")}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getStatusIcon(workflow.status, workflow.conclusion)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold hover:text-primary transition-colors">
                        {workflow.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{workflow.head_branch}</span>
                      <span>{workflow.event}</span>
                      <span>
                        {formatDistanceToNow(new Date(workflow.created_at), { addSuffix: true })}
                      </span>
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

