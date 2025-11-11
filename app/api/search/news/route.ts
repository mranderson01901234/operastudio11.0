import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { searchBraveNews } from "@/lib/search/news-client";
import type { BraveSearchParams } from "@/lib/search/types";
import { getCachedResults, setCachedResults } from "@/lib/search/cache";
import { checkSearchRateLimit } from "@/lib/search/rateLimit";

/**
 * POST /api/search/news
 * Search for news using Brave Search API
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { query, count, offset, safesearch, freshness, country, search_lang, refresh } = body;

    // Check rate limit (unless refresh is explicitly requested)
    if (!refresh) {
      const rateLimit = await checkSearchRateLimit(userId);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            error: `Search rate limit exceeded. You have used your hourly quota of 100 searches. Please try again after ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
            rateLimit: {
              remaining: rateLimit.remaining,
              resetAt: rateLimit.resetAt,
              limit: 100,
            },
          },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": "100",
              "X-RateLimit-Remaining": String(rateLimit.remaining),
              "X-RateLimit-Reset": String(rateLimit.resetAt),
              "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
            },
          }
        );
      }
    }

    // Validate required parameters
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Query parameter is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Validate optional parameters
    const params: BraveSearchParams & { freshness?: "pd" | "pw" | "pm" | "py" } = {
      q: query.trim(),
    };

    if (count !== undefined) {
      if (typeof count !== "number" || count < 1 || count > 20) {
        return NextResponse.json(
          { error: "Count must be a number between 1 and 20" },
          { status: 400 }
        );
      }
      params.count = count;
    }

    if (offset !== undefined) {
      if (typeof offset !== "number" || offset < 0) {
        return NextResponse.json(
          { error: "Offset must be a non-negative number" },
          { status: 400 }
        );
      }
      params.offset = offset;
    }

    if (safesearch !== undefined) {
      if (!["strict", "moderate", "off"].includes(safesearch)) {
        return NextResponse.json(
          { error: "Safesearch must be 'strict', 'moderate', or 'off'" },
          { status: 400 }
        );
      }
      params.safesearch = safesearch;
    }

    if (freshness !== undefined) {
      if (!["pd", "pw", "pm", "py"].includes(freshness)) {
        return NextResponse.json(
          { error: "Freshness must be 'pd', 'pw', 'pm', or 'py'" },
          { status: 400 }
        );
      }
      params.freshness = freshness;
    }

    if (country !== undefined) {
      if (typeof country !== "string" || country.length !== 2) {
        return NextResponse.json(
          { error: "Country must be a 2-character ISO 3166-1 alpha-2 code" },
          { status: 400 }
        );
      }
      params.country = country.toUpperCase();
    }

    if (search_lang !== undefined) {
      if (typeof search_lang !== "string" || search_lang.length !== 2) {
        return NextResponse.json(
          { error: "Search language must be a 2-character ISO 639-1 code" },
          { status: 400 }
        );
      }
      params.search_lang = search_lang.toLowerCase();
    }

    // Check cache first (unless refresh is requested)
    // News searches use shorter cache TTL (5 minutes) due to time-sensitive nature
    if (!refresh) {
      // Use freshness parameter to determine cache TTL
      const cached = await getCachedResults(params).catch(() => null);
      if (cached) {
        return NextResponse.json({
          ...cached,
          cached: true,
        });
      }
    }

    // Perform news search
    const result = await searchBraveNews(params);

    // Cache results (async, don't wait) - shorter TTL for news (5 minutes)
    setCachedResults(params, result as any).catch((error) => {
      console.error("[News Search API] Failed to cache results:", error);
    });

    return NextResponse.json({
      ...result,
      cached: false,
    });
  } catch (error) {
    console.error("[News Search API] Error:", error);

    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        return NextResponse.json(
          { error: "Search service configuration error" },
          { status: 500 }
        );
      }
      if (error.message.includes("Rate limit")) {
        return NextResponse.json(
          { error: "Search rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }
      if (error.message.includes("timeout")) {
        return NextResponse.json(
          { error: "News search request timed out. Please try again." },
          { status: 504 }
        );
      }
      if (error.message.includes("Invalid request")) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: error.message || "News search failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

