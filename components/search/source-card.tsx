"use client";

import React from "react";
import type { SearchResultItem } from "@/lib/search/search-result-types";

interface SourceCardProps {
  result: SearchResultItem;
  onClick?: () => void;
}

/**
 * Individual source card component
 * Shows thumbnail (favicon), title, and hostname
 */
export function SourceCard({ result, onClick }: SourceCardProps) {
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${result.hostname}&sz=32`;
  const displayHostname = result.hostname.replace(/^www\./, "");

  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors cursor-pointer min-w-[200px] max-w-[280px] flex-shrink-0"
    >
      {/* Thumbnail/Favicon */}
      <div className="flex items-center gap-2">
        <img
          src={faviconUrl}
          alt=""
          className="w-4 h-4 flex-shrink-0"
          onError={(e) => {
            // Fallback to a default icon if favicon fails
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="text-xs text-muted-foreground truncate">
          {displayHostname}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
        {result.title}
      </h4>

      {/* Description (optional, truncated) */}
      {result.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {result.description}
        </p>
      )}
    </a>
  );
}

