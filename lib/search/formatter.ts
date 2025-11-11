/**
 * Enhanced search result formatting
 * Optimizes search results for LLM consumption
 */

import type { BraveSearchResult, SearchApiResponse } from "./types";
import type { SearchResultMetadata, SearchResultItem } from "./search-result-types";

/**
 * Check if URL is a YouTube video
 */
function isYouTubeVideo(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be/.test(url);
}

/**
 * Check if URL is a podcast platform
 */
function isPodcast(url: string, hostname?: string): boolean {
  const podcastDomains = [
    'spotify.com',
    'apple.com/podcasts',
    'podcasts.apple.com',
    'podcast',
    'anchor.fm',
    'podbean.com',
    'stitcher.com',
    'pandora.com',
    'iheart.com',
    'tunein.com',
    'castro.fm',
    'overcast.fm',
    'pocketcasts.com',
    'podcastaddict.com',
  ];
  
  const lowerUrl = url.toLowerCase();
  const lowerHostname = hostname?.toLowerCase() || '';
  
  return podcastDomains.some(domain => 
    lowerUrl.includes(domain) || lowerHostname.includes(domain)
  );
}

/**
 * Format search results for LLM consumption
 * Extracts key information and optimizes presentation
 * Categorizes YouTube videos and podcasts separately
 */
export function formatSearchResultsForLLM(results: SearchApiResponse): string {
  if (!results.results || results.results.length === 0) {
    return JSON.stringify({
      count: 0,
      total: results.total || 0,
      message: "No search results found",
      query: results.query?.original || "unknown",
    });
  }

  // Separate results into categories
  const articles: Array<{
    index: number;
    title: string;
    url: string;
    description: string;
    hostname?: string;
    relevance?: string;
  }> = [];
  
  const youtubeVideos: Array<{
    index: number;
    title: string;
    url: string;
    description: string;
    hostname?: string;
  }> = [];
  
  const podcasts: Array<{
    index: number;
    title: string;
    url: string;
    description: string;
    hostname?: string;
  }> = [];

  // Categorize results
  results.results.forEach((item, index) => {
    const baseItem = {
      index: index + 1,
      title: item.title || "Untitled",
      url: item.url,
      description: truncateDescription(item.description || "", 200),
      hostname: item.meta_url?.hostname,
    };

    if (isYouTubeVideo(item.url)) {
      youtubeVideos.push(baseItem);
    } else if (isPodcast(item.url, item.meta_url?.hostname)) {
      podcasts.push(baseItem);
    } else {
      articles.push({
        ...baseItem,
        relevance: index < 3 ? "high" : index < 7 ? "medium" : "low",
      });
    }
  });

  // Build formatted response
  const formatted: {
    count: number;
    total: number;
    query: string;
    altered_query?: string;
    articles?: typeof articles;
    youtube_videos?: typeof youtubeVideos;
    podcasts?: typeof podcasts;
    summary: ReturnType<typeof generateSummary>;
  } = {
    count: results.count || results.results.length,
    total: results.total || 0,
    query: results.query?.original || "unknown",
    summary: generateSummary(results),
  };

  if (results.query?.altered) {
    formatted.altered_query = results.query.altered;
  }

  // Only include categories that have results
  if (articles.length > 0) {
    formatted.articles = articles;
  }
  if (youtubeVideos.length > 0) {
    formatted.youtube_videos = youtubeVideos;
  }
  if (podcasts.length > 0) {
    formatted.podcasts = podcasts;
  }

  return JSON.stringify(formatted, null, 2);
}

/**
 * Truncate description to max length while preserving sentences
 */
function truncateDescription(description: string, maxLength: number): string {
  if (description.length <= maxLength) {
    return description;
  }

  // Try to truncate at sentence boundary
  const truncated = description.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastExclamation = truncated.lastIndexOf("!");
  const lastQuestion = truncated.lastIndexOf("?");

  const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);

  if (lastSentenceEnd > maxLength * 0.7) {
    // If we found a sentence end reasonably close to maxLength, use it
    return truncated.substring(0, lastSentenceEnd + 1);
  }

  // Otherwise, truncate at word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace) + "...";
  }

  return truncated + "...";
}

/**
 * Generate a brief summary of search results
 */
function generateSummary(results: SearchApiResponse): {
  total_results: number;
  top_domains: string[];
  result_types: string[];
} {
  const topDomains = new Set<string>();
  const resultTypes = new Set<string>();

  // Extract top domains and result types
  results.results?.slice(0, 10).forEach((result) => {
    if (result.meta_url?.hostname) {
      topDomains.add(result.meta_url.hostname);
    }
    if (result.type) {
      resultTypes.add(result.type);
    }
  });

  return {
    total_results: results.total || 0,
    top_domains: Array.from(topDomains).slice(0, 5),
    result_types: Array.from(resultTypes),
  };
}

/**
 * Extract key information from search results for quick reference
 */
export function extractKeyInfo(results: SearchApiResponse): {
  topResults: Array<{ title: string; url: string; snippet: string }>;
  totalResults: number;
  query: string;
} {
  const topResults = (results.results || [])
    .slice(0, 5)
    .map((result) => ({
      title: result.title || "Untitled",
      url: result.url,
      snippet: truncateDescription(result.description || "", 150),
    }));

  return {
    topResults,
    totalResults: results.total || 0,
    query: results.query?.original || "unknown",
  };
}

/**
 * Format a single search result for display
 */
export function formatSingleResult(result: BraveSearchResult, index: number): string {
  const parts: string[] = [];
  
  parts.push(`${index + 1}. ${result.title || "Untitled"}`);
  parts.push(`   URL: ${result.url}`);
  
  if (result.description) {
    parts.push(`   ${truncateDescription(result.description, 200)}`);
  }
  
  if (result.meta_url?.hostname) {
    parts.push(`   Source: ${result.meta_url.hostname}`);
  }
  
  if (result.page_age) {
    parts.push(`   Date: ${result.page_age}`);
  }
  
  return parts.join("\n");
}

/**
 * Create search result metadata for Perplexity-style rendering
 * Converts search API response to structured metadata format
 */
export function createSearchResultMetadata(
  results: SearchApiResponse
): SearchResultMetadata {
  const searchItems: SearchResultItem[] = (results.results || []).map((item, index) => {
    // Extract hostname safely
    let hostname = item.meta_url?.hostname;
    if (!hostname && item.url) {
      try {
        hostname = new URL(item.url).hostname;
      } catch {
        // Fallback if URL parsing fails
        hostname = "unknown";
      }
    }

    return {
      title: item.title || "Untitled",
      url: item.url,
      description: truncateDescription(item.description || "", 200),
      hostname: hostname || "unknown",
      thumbnail: undefined, // Will be fetched via favicon service
      page_age: item.page_age,
      index: index + 1,
    };
  });

  return {
    query: results.query?.original || "unknown",
    total: results.total || 0,
    count: results.count || searchItems.length,
    results: searchItems,
    // Categories and related questions will be extracted from LLM response
  };
}

