"use client";

import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

export interface VideoResult {
  url: string;
  title: string;
  description: string;
}

interface VideoTabProps {
  query: string;
  onVideosLoaded?: (videos: VideoResult[]) => void;
}

/**
 * Video tab component that searches for videos related to the query
 * Returns videos via callback instead of rendering them directly
 */
export function VideoTab({ query, onVideosLoaded }: VideoTabProps) {
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const searchVideos = async () => {
      setLoading(true);
      setError(null);

      try {
        // Try multiple search queries to get more video results
        const searchQueries = [
          `${query} video YouTube`,
          `${query} YouTube tutorial`,
          `${query} video guide`,
        ];
        
        const allVideos: VideoResult[] = [];
        const seenUrls = new Set<string>();
        const youtubePattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i;
        
        // Search with multiple queries
        for (const videoQuery of searchQueries) {
          try {
            const response = await fetch("/api/search", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query: videoQuery,
                count: 20, // Get more results to filter YouTube videos
              }),
            });

            if (!response.ok) {
              continue; // Skip failed queries
            }

            const data = await response.json();
            
            if (data.results && Array.isArray(data.results)) {
              for (const result of data.results) {
                // Check if URL is a YouTube video and not already added
                if (result.url && youtubePattern.test(result.url) && !seenUrls.has(result.url)) {
                  seenUrls.add(result.url);
                  allVideos.push({
                    url: result.url,
                    title: result.title || "Untitled Video",
                    description: result.description || "",
                  });
                  
                  // Limit to 20 videos total
                  if (allVideos.length >= 20) {
                    break;
                  }
                }
              }
            }
            
            if (allVideos.length >= 20) {
              break;
            }
          } catch (err) {
            console.error("Error in video search query:", err);
            // Continue with next query
          }
        }

        setVideos(allVideos);
        // Notify parent component of loaded videos
        if (onVideosLoaded) {
          onVideosLoaded(allVideos);
        }
      } catch (err) {
        console.error("Error searching for videos:", err);
        setError(err instanceof Error ? err.message : "Failed to load videos");
      } finally {
        setLoading(false);
      }
    };

    searchVideos();
  }, [query, onVideosLoaded]);

  // Don't show loading state - parent handles it with skeleton
  // Only show error or empty states if needed (parent will handle most cases)
  // Return null to avoid disrupting UI - videos are displayed via VideoChips
  return null;
}

