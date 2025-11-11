"use client";

import React, { useState, useEffect } from "react";
import { AnswerHeader } from "./answer-header";
import { SourceChips } from "./source-chips";
import { AnswerSections } from "./answer-sections";
import { VideoTab, type VideoResult } from "./video-tab";
import { VideoChips } from "./video-chips";
import { PodcastTab, type PodcastResult } from "./podcast-tab";
import { PodcastChips } from "./podcast-chips";
import { ChipSkeleton } from "./chip-skeleton";
import type { SearchAnswerPayload } from "@/lib/search/search-result-types";

interface SearchAnswerProps {
  payload: SearchAnswerPayload;
}

/**
 * Main Perplexity-style search answer view
 * Orchestrates all sub-components for a clean, structured answer layout
 */
export function SearchAnswer({ payload }: SearchAnswerProps) {
  const [activeTab, setActiveTab] = useState<"answer" | "videos" | "listen">(payload.mode);
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [podcasts, setPodcasts] = useState<PodcastResult[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [podcastsLoading, setPodcastsLoading] = useState(true);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [podcastsError, setPodcastsError] = useState<string | null>(null);

  // Pre-load videos and podcasts in the background when component mounts
  useEffect(() => {
    // Pre-load videos using multiple queries (same logic as VideoTab)
    const loadVideos = async () => {
      setVideosLoading(true);
      try {
        const searchQueries = [
          `${payload.query} video YouTube`,
          `${payload.query} YouTube tutorial`,
          `${payload.query} video guide`,
        ];
        
        const allVideos: VideoResult[] = [];
        const seenUrls = new Set<string>();
        const youtubePattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i;
        
        // Search with multiple queries
        for (const videoQuery of searchQueries) {
          try {
            const response = await fetch("/api/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: videoQuery, count: 20 }),
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
      } catch (err) {
        console.error("Error pre-loading videos:", err);
        setVideosError(err instanceof Error ? err.message : "Failed to load videos. You may be rate limited.");
      } finally {
        setVideosLoading(false);
      }
    };

    // Pre-load podcasts
    const loadPodcasts = async () => {
      setPodcastsLoading(true);
      try {
        const podcastQuery = `${payload.query} podcast`;
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: podcastQuery, count: 20 }),
        });
        if (response.ok) {
          const data = await response.json();
          const podcastPatterns = [
            /spotify\.com/i, /apple\.com\/podcast/i, /podcasts\.apple\.com/i,
            /podcast/i, /soundcloud\.com/i, /anchor\.fm/i, /buzzsprout\.com/i,
            /libsyn\.com/i, /stitcher\.com/i, /pandora\.com/i, /iheart\.com/i, /tunein\.com/i,
          ];
          const allPodcasts: PodcastResult[] = [];
          const seenUrls = new Set<string>();
          
          if (data.results) {
            for (const result of data.results) {
              if (result.url && !seenUrls.has(result.url)) {
                const isPodcast = podcastPatterns.some(pattern => pattern.test(result.url));
                if (isPodcast) {
                  seenUrls.add(result.url);
                  let hostname = "";
                  try {
                    hostname = new URL(result.url).hostname.replace(/^www\./, "");
                  } catch {
                    hostname = result.hostname || "";
                  }
                  allPodcasts.push({
                    url: result.url,
                    title: result.title || "Untitled Podcast",
                    description: result.description || "",
                    hostname: hostname,
                  });
                  if (allPodcasts.length >= 20) break;
                }
              }
            }
          }
          setPodcasts(allPodcasts);
        }
      } catch (err) {
        console.error("Error pre-loading podcasts:", err);
        setPodcastsError(err instanceof Error ? err.message : "Failed to load podcasts. You may be rate limited.");
      } finally {
        setPodcastsLoading(false);
      }
    };

    // Load both in parallel
    loadVideos();
    loadPodcasts();
  }, [payload.query]);

  console.log("[SearchAnswer] Rendering with payload:", payload);
  console.log("[SearchAnswer] Sources count:", payload.sources.length);
  console.log("[SearchAnswer] Sections count:", payload.sections.length);
  console.log("[SearchAnswer] Active tab:", activeTab);
  console.log("[SearchAnswer] Videos count:", videos.length, "Loading:", videosLoading, "Error:", videosError);
  console.log("[SearchAnswer] Podcasts count:", podcasts.length, "Loading:", podcastsLoading, "Error:", podcastsError);

  // Limit the number of items displayed (cut in half)
  const MAX_SOURCES = 5;  // Reduced from typical 10
  const MAX_VIDEOS = 10;  // Reduced from 20
  const MAX_PODCASTS = 10; // Reduced from 20

  const limitedSources = payload.sources.slice(0, MAX_SOURCES);
  const limitedVideos = videos.slice(0, MAX_VIDEOS);
  const limitedPodcasts = podcasts.slice(0, MAX_PODCASTS);

  return (
    <div className="mx-auto w-full max-w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl px-4 sm:px-6 md:px-8 py-4 sm:py-6 space-y-4 min-w-0">
      {/* Header: Title + Tabs */}
      <AnswerHeader
        query={payload.query}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Video Tab - Loads videos if not already loaded */}
      {activeTab === "videos" && videos.length === 0 && !videosLoading && (
        <VideoTab 
          query={payload.query} 
          onVideosLoaded={(newVideos) => {
            setVideos(newVideos);
            setVideosLoading(false);
          }}
        />
      )}

      {/* Podcast Tab - Loads podcasts if not already loaded */}
      {activeTab === "listen" && podcasts.length === 0 && !podcastsLoading && (
        <PodcastTab 
          query={payload.query} 
          onPodcastsLoaded={(newPodcasts) => {
            setPodcasts(newPodcasts);
            setPodcastsLoading(false);
          }}
        />
      )}

      {/* Divider Line */}
      <hr className="border-t border-zinc-800/50 my-4" />

      {/* Source Chips, Video Chips, or Podcast Chips */}
      <div className="transition-opacity duration-200">
        {activeTab === "answer" && limitedSources.length > 0 ? (
          <SourceChips sources={limitedSources} />
        ) : activeTab === "videos" ? (
          videosLoading ? (
            <ChipSkeleton count={4} type="video" />
          ) : videosError ? (
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 text-sm">
              <p className="text-yellow-400 font-semibold mb-1">⚠️ Unable to load videos</p>
              <p className="text-yellow-200/80">{videosError}</p>
              <p className="text-yellow-200/60 text-xs mt-2">Try again later or check your rate limits.</p>
            </div>
          ) : limitedVideos.length > 0 ? (
            <VideoChips videos={limitedVideos} />
          ) : (
            <div className="text-zinc-400 text-sm py-4">
              No videos found for this query.
            </div>
          )
        ) : activeTab === "listen" ? (
          podcastsLoading ? (
            <ChipSkeleton count={4} type="podcast" />
          ) : podcastsError ? (
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 text-sm">
              <p className="text-yellow-400 font-semibold mb-1">⚠️ Unable to load podcasts</p>
              <p className="text-yellow-200/80">{podcastsError}</p>
              <p className="text-yellow-200/60 text-xs mt-2">Try again later or check your rate limits.</p>
            </div>
          ) : limitedPodcasts.length > 0 ? (
            <PodcastChips podcasts={limitedPodcasts} />
          ) : (
            <div className="text-zinc-400 text-sm py-4">
              No podcasts found for this query.
            </div>
          )
        ) : null}
      </div>

      {/* Answer Sections - Show on all tabs */}
      {payload.sections.length > 0 && (
        <>
          {/* Steps Caption */}
          <p className="text-xs text-zinc-500 mt-4 mb-4">
            {payload.stepsCaption || "Assistant steps"}
          </p>

          <AnswerSections
            sections={payload.sections}
            sources={limitedSources}
          />
        </>
      )}
    </div>
  );
}


