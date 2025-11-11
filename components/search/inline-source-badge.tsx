"use client";

import React from "react";
import type { SearchAnswerPayload } from "@/lib/search/search-result-types";

interface InlineSourceBadgeProps {
  source: SearchAnswerPayload["sources"][number];
}

/**
 * Tiny inline badge that appears after bullet text linking to source
 */
export function InlineSourceBadge({ source }: InlineSourceBadgeProps) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-1.5 inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400 transition-colors no-underline"
      aria-label={`Source: ${source.title}`}
    >
      {/* Favicon */}
      {source.favicon && (
        <img 
          src={source.favicon} 
          alt="" 
          className="w-3 h-3 rounded-[2px] flex-shrink-0" 
        />
      )}
      
      {/* Publisher Name */}
      <span className="max-w-[80px] truncate">
        {source.title}
      </span>
    </a>
  );
}

