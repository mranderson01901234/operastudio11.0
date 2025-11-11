/**
 * Brave Search Image API client
 * Handles communication with Brave Search Image API
 */

import type { BraveSearchParams, ImageSearchApiResponse } from "./types";

const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY;
const BRAVE_SEARCH_IMAGE_URL = "https://api.search.brave.com/res/v1/images/search";

/**
 * Search for images using Brave Search API
 */
export async function searchBraveImages(params: BraveSearchParams): Promise<ImageSearchApiResponse> {
  if (!BRAVE_SEARCH_API_KEY) {
    throw new Error("BRAVE_SEARCH_API_KEY is not configured");
  }

  // Build query parameters
  const searchParams = new URLSearchParams({
    q: params.q,
  });

  if (params.count !== undefined) {
    searchParams.set("count", String(Math.min(Math.max(1, params.count), 20)));
  }
  if (params.offset !== undefined) {
    searchParams.set("offset", String(Math.max(0, params.offset)));
  }
  if (params.safesearch) {
    searchParams.set("safesearch", params.safesearch);
  }
  if (params.country) {
    searchParams.set("country", params.country);
  }
  if (params.search_lang) {
    searchParams.set("search_lang", params.search_lang);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(`${BRAVE_SEARCH_IMAGE_URL}?${searchParams}`, {
      method: "GET",
      headers: {
        "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Invalid Brave Search API key");
      }
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      if (response.status === 400) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Invalid request: ${errorData.error || response.statusText}`);
      }
      throw new Error(`Image search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      results: data.results || [],
      total: data.total || 0,
      count: data.count || data.results?.length || 0,
      query: {
        original: data.query?.original || params.q,
        altered: data.query?.altered?.query,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Image search request timed out after 30 seconds");
    }
    
    throw error;
  }
}

