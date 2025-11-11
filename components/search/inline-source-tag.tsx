"use client";

import React from "react";

interface InlineSourceTagProps {
  hostname: string;
  url?: string;
}

/**
 * Small inline source tag badge (like Perplexity's source tags)
 * Appears after bullet points to show source attribution
 */
export function InlineSourceTag({ hostname, url }: InlineSourceTagProps) {
  const displayName = hostname.replace(/^www\./, "");

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded text-xs font-normal text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {displayName}
      </a>
    );
  }

  return (
    <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded text-xs font-normal text-muted-foreground bg-muted">
      {displayName}
    </span>
  );
}

