"use client";

import React from "react";
import { Youtube } from "lucide-react";

interface YouTubeVideoCardProps {
  url: string;
  title?: string;
  description?: string;
  relevance?: string;
}

/**
 * Extract YouTube video ID from URL
 */
function extractVideoId(url: string): string | null {
  try {
    // Handle different YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Get YouTube thumbnail URL from video ID
 */
function getThumbnailUrl(videoId: string): string {
  // Use maxresdefault for highest quality, fallback to hqdefault
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * Clean HTML tags from text
 */
function cleanHtml(text: string): string {
  if (!text) return "";
  // Remove HTML tags
  return text.replace(/<[^>]*>/g, "").trim();
}

/**
 * Clean description by removing URLs, HTML tags, and excessive text
 */
function cleanDescription(description: string): string {
  if (!description) return "";
  
  // Remove HTML tags first
  let cleaned = cleanHtml(description);
  
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, "");
  
  // Remove common YouTube subscription text
  cleaned = cleaned.replace(/For access to live and exclusive video.*$/i, "");
  cleaned = cleaned.replace(/Subscribe.*$/i, "");
  cleaned = cleaned.replace(/CNBC PRO.*$/i, "");
  
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  // Limit length
  if (cleaned.length > 120) {
    cleaned = cleaned.substring(0, 120).trim() + "...";
  }
  
  return cleaned;
}

/**
 * Clean title by removing "YouTube" suffix, HTML tags, and other clutter
 */
function cleanTitle(title: string): string {
  if (!title) return "YouTube Video";
  
  // Remove HTML tags first
  let cleaned = cleanHtml(title);
  
  // Remove " - YouTube" suffix
  cleaned = cleaned.replace(/\s*-\s*YouTube\s*$/i, "");
  
  // Remove "YouTube:" prefix
  cleaned = cleaned.replace(/^YouTube:\s*/i, "");
  
  return cleaned.trim() || "YouTube Video";
}

/**
 * Professional YouTube video card component - Clean and minimal design
 */
export function YouTubeVideoCard({ url, title, description, relevance }: YouTubeVideoCardProps) {
  const videoId = extractVideoId(url);
  const thumbnailUrl = videoId ? getThumbnailUrl(videoId) : null;
  const displayTitle = cleanTitle(title || "");
  const displayDescription = cleanDescription(description || "");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group h-full"
    >
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-700 transition-all overflow-hidden h-full flex flex-col">
        {/* Thumbnail */}
        <div className="relative w-full aspect-video bg-zinc-800 overflow-hidden flex-shrink-0">
          {thumbnailUrl ? (
            <>
              <img
                src={thumbnailUrl}
                alt={displayTitle}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to a placeholder if thumbnail fails to load
                  const target = e.target as HTMLImageElement;
                  if (videoId) {
                    target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                  }
                }}
              />
              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                <div className="w-12 h-12 rounded-full bg-red-600/95 flex items-center justify-center group-hover:bg-red-600 group-hover:scale-110 transition-all shadow-lg">
                  <svg
                    className="w-6 h-6 text-white ml-1"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              {/* YouTube logo badge */}
              <div className="absolute top-1.5 right-1.5 bg-black/70 rounded px-1.5 py-0.5 flex items-center gap-1">
                <Youtube className="w-2.5 h-2.5 text-white" />
                <span className="text-[10px] text-white font-medium">YouTube</span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Youtube className="w-12 h-12 text-zinc-600" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-2.5 flex-1 flex flex-col min-h-[60px]">
          {/* Title - Always show, fixed height */}
          <h3 className="font-semibold text-xs text-zinc-200 group-hover:text-white transition-colors line-clamp-2 leading-snug min-h-[32px] flex items-start">
            {displayTitle}
          </h3>

          {/* Description - Always reserve space, show if available */}
          <div className="mt-1 min-h-[28px] flex items-start">
            {displayDescription && displayDescription.length > 20 ? (
              <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                {displayDescription}
              </p>
            ) : (
              <div className="h-full" />
            )}
          </div>
        </div>
      </div>
    </a>
  );
}

