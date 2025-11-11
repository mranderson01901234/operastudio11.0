"use client";

import React from "react";

interface ChipSkeletonProps {
  count?: number;
  type?: "video" | "podcast" | "source";
}

/**
 * Skeleton loader for chips - maintains layout without jarring transitions
 */
export function ChipSkeleton({ count = 4, type = "source" }: ChipSkeletonProps) {
  const isVideo = type === "video";
  const isPodcast = type === "podcast";
  
  return (
    <div className="relative w-full mb-6">
      <div className="flex gap-3">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className={`flex-shrink-0 rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden ${
              isVideo ? "w-[260px]" : "w-[240px]"
            }`}
          >
            {isVideo ? (
              // Video skeleton
              <>
                <div className="relative w-full aspect-video bg-zinc-800 animate-pulse" />
                <div className="p-2.5 space-y-1">
                  <div className="h-3 bg-zinc-800 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-zinc-800 rounded animate-pulse w-full" />
                  <div className="h-2 bg-zinc-800/50 rounded animate-pulse w-2/3 mt-1" />
                </div>
              </>
            ) : (
              // Podcast/Source skeleton
              <div className="flex gap-3 p-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-zinc-800 animate-pulse" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-zinc-800/50 rounded animate-pulse w-1/2" />
                  <div className="h-3 bg-zinc-800/50 rounded animate-pulse w-full" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

