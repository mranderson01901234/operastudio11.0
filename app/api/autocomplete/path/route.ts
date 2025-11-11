/**
 * Path Autocomplete API
 * Real-time path suggestions as user types
 *
 * Philosophy: Better UX, fewer typos
 * Uses filesystem index for instant suggestions
 */

import { NextRequest, NextResponse } from "next/server";
import { filesystemIndex } from "@/lib/utils/filesystem-index";
import * as path from "path";
import * as os from "os";

export interface AutocompleteSuggestion {
  path: string;
  type: "file" | "directory";
  score: number;
  matchType: "exact" | "prefix" | "fuzzy";
  description?: string;
}

export interface AutocompleteResponse {
  query: string;
  suggestions: AutocompleteSuggestion[];
  count: number;
}

/**
 * GET /api/autocomplete/path?q=myfile&limit=10&type=file
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const type = searchParams.get("type") as "file" | "directory" | "both" || "both";

    if (!query || query.length < 1) {
      return NextResponse.json({
        query: "",
        suggestions: [],
        count: 0,
      } as AutocompleteResponse);
    }

    // Search using filesystem index
    const indexResults = filesystemIndex.search(query, type, limit);

    // Transform to autocomplete suggestions
    const suggestions: AutocompleteSuggestion[] = indexResults.map((result) => {
      // Determine match type
      let matchType: "exact" | "prefix" | "fuzzy" = "fuzzy";
      const basename = path.basename(result.path).toLowerCase();
      const queryLower = query.toLowerCase();

      if (basename === queryLower) {
        matchType = "exact";
      } else if (basename.startsWith(queryLower)) {
        matchType = "prefix";
      }

      // Generate description
      const dirname = path.dirname(result.path);
      const description = dirname === os.homedir() ? "~" : dirname.replace(os.homedir(), "~");

      return {
        path: result.path,
        type: result.path.endsWith("/") ? "directory" : "file",
        score: result.score,
        matchType: result.matchType === "exact" ? matchType : "fuzzy",
        description,
      };
    });

    // Sort: exact matches first, then prefix matches, then fuzzy
    suggestions.sort((a, b) => {
      const typeOrder = { exact: 0, prefix: 1, fuzzy: 2 };
      const aOrder = typeOrder[a.matchType];
      const bOrder = typeOrder[b.matchType];

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      // Same match type, sort by score
      return b.score - a.score;
    });

    const response: AutocompleteResponse = {
      query,
      suggestions: suggestions.slice(0, limit),
      count: suggestions.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Path Autocomplete API] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to autocomplete path",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/autocomplete/path
 * Body: { query: string, limit?: number, type?: "file" | "directory" | "both", workingDir?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, limit = 10, type = "both", workingDir } = body;

    if (!query || typeof query !== "string" || query.length < 1) {
      return NextResponse.json({
        query: "",
        suggestions: [],
        count: 0,
      } as AutocompleteResponse);
    }

    // Search using filesystem index
    const indexResults = filesystemIndex.search(
      query,
      type as "file" | "directory" | "both",
      limit
    );

    // Transform to autocomplete suggestions
    const suggestions: AutocompleteSuggestion[] = indexResults.map((result) => {
      // Determine match type
      let matchType: "exact" | "prefix" | "fuzzy" = "fuzzy";
      const basename = path.basename(result.path).toLowerCase();
      const queryLower = query.toLowerCase();

      if (basename === queryLower) {
        matchType = "exact";
      } else if (basename.startsWith(queryLower)) {
        matchType = "prefix";
      }

      // Generate description (relative to working dir if provided)
      let description: string;
      if (workingDir) {
        description = path.relative(workingDir, result.path);
        if (description.startsWith("..")) {
          // Outside working dir, show absolute
          description = result.path.replace(os.homedir(), "~");
        } else if (description === "") {
          description = ".";
        }
      } else {
        const dirname = path.dirname(result.path);
        description = dirname === os.homedir() ? "~" : dirname.replace(os.homedir(), "~");
      }

      return {
        path: result.path,
        type: result.path.endsWith("/") ? "directory" : "file",
        score: result.score,
        matchType: result.matchType === "exact" ? matchType : "fuzzy",
        description,
      };
    });

    // Sort: exact matches first, then prefix matches, then fuzzy
    suggestions.sort((a, b) => {
      const typeOrder = { exact: 0, prefix: 1, fuzzy: 2 };
      const aOrder = typeOrder[a.matchType];
      const bOrder = typeOrder[b.matchType];

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      // Same match type, sort by score
      return b.score - a.score;
    });

    const response: AutocompleteResponse = {
      query,
      suggestions: suggestions.slice(0, limit),
      count: suggestions.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Path Autocomplete API] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to autocomplete path",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
