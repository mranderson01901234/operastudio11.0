"use client";

import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

export interface PodcastResult {
  url: string;
  title: string;
  description: string;
  hostname: string;
}

interface PodcastTabProps {
  query: string;
  onPodcastsLoaded?: (podcasts: PodcastResult[]) => void;
}

/**
 * Podcast tab component that searches for podcasts related to the query
 * Returns podcasts via callback instead of rendering them directly
 */
export function PodcastTab({ query, onPodcastsLoaded }: PodcastTabProps) {
  const [podcasts, setPodcasts] = useState<PodcastResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const searchPodcasts = async () => {
      setLoading(true);
      setError(null);

      try {
        // Try multiple search queries to get more podcast results
        const searchQueries = [
          `${query} podcast`,
          `${query} podcast episode`,
          `${query} audio podcast`,
        ];
        
        const allPodcasts: PodcastResult[] = [];
        const seenUrls = new Set<string>();
        
        // Common podcast platforms and patterns
        const podcastPatterns = [
          /spotify\.com/i,
          /apple\.com\/podcast/i,
          /podcasts\.apple\.com/i,
          /podcast/i,
          /soundcloud\.com/i,
          /anchor\.fm/i,
          /buzzsprout\.com/i,
          /libsyn\.com/i,
          /stitcher\.com/i,
          /pandora\.com/i,
          /iheart\.com/i,
          /tunein\.com/i,
        ];
        
        // Search with multiple queries
        for (const podcastQuery of searchQueries) {
          try {
            const response = await fetch("/api/search", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query: podcastQuery,
                count: 20, // Get more results to filter podcasts
              }),
            });

            if (!response.ok) {
              continue; // Skip failed queries
            }

            const data = await response.json();
            
            if (data.results && Array.isArray(data.results)) {
              for (const result of data.results) {
                // Check if URL is from a podcast platform and not already added
                if (result.url && !seenUrls.has(result.url)) {
                  const isPodcast = podcastPatterns.some(pattern => pattern.test(result.url));
                  
                  if (isPodcast) {
                    seenUrls.add(result.url);
                    
                    // Extract hostname
                    let hostname = "";
                    try {
                      const urlObj = new URL(result.url);
                      hostname = urlObj.hostname.replace(/^www\./, "");
                    } catch {
                      hostname = result.hostname || "";
                    }
                    
                    allPodcasts.push({
                      url: result.url,
                      title: result.title || "Untitled Podcast",
                      description: result.description || "",
                      hostname: hostname,
                    });
                    
                    // Limit to 20 podcasts total
                    if (allPodcasts.length >= 20) {
                      break;
                    }
                  }
                }
              }
            }
            
            if (allPodcasts.length >= 20) {
              break;
            }
          } catch (err) {
            console.error("Error in podcast search query:", err);
            // Continue with next query
          }
        }

        setPodcasts(allPodcasts);
        // Notify parent component of loaded podcasts
        if (onPodcastsLoaded) {
          onPodcastsLoaded(allPodcasts);
        }
      } catch (err) {
        console.error("Error searching for podcasts:", err);
        setError(err instanceof Error ? err.message : "Failed to load podcasts");
      } finally {
        setLoading(false);
      }
    };

    searchPodcasts();
  }, [query, onPodcastsLoaded]);

  // Don't show loading state - parent handles it with skeleton
  // Only show error or empty states if needed (parent will handle most cases)
  // Return null to avoid disrupting UI - podcasts are displayed via PodcastChips
  return null;
}

