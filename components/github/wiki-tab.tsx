"use client";

import React, { useEffect, useState } from "react";
import { useGitHub } from "@/contexts/github-context";
import { Book, Loader2, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function WikiTab() {
  const { state } = useGitHub();
  const { selectedRepository } = state;
  const [wikiPages, setWikiPages] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedRepository) return;

    const loadWiki = async () => {
      setLoading(true);
      try {
        // Note: GitHub Wiki API requires special permissions
        // This is a placeholder implementation
        setWikiPages([]);
      } catch (err) {
        console.error("Error loading wiki:", err);
      } finally {
        setLoading(false);
      }
    };

    loadWiki();
  }, [selectedRepository]);

  if (!selectedRepository) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a repository to view wiki</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border p-4">
        <h2 className="text-lg font-semibold">Wiki</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Repository documentation and wiki pages
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Book className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-2">Wiki not available</p>
          <p className="text-xs text-muted-foreground">
            This repository doesn't have a wiki enabled
          </p>
        </div>
      </div>
    </div>
  );
}

