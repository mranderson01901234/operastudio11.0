/**
 * Search result summarization utility
 * Uses LLM to summarize multiple search results into concise answers
 */

import type { SearchApiResponse } from "./types";
import { streamChat } from "@/lib/chat/session";

/**
 * Summarize search results using LLM
 * Takes top N results and generates a concise summary
 */
export async function summarizeSearchResults(
  searchResults: SearchApiResponse,
  maxResults: number = 5
): Promise<string> {
  if (!searchResults.results || searchResults.results.length === 0) {
    return "No search results available to summarize.";
  }

  // Take top N results
  const topResults = searchResults.results.slice(0, maxResults);
  
  // Build summary prompt
  const resultsText = topResults.map((result, index) => {
    return `Result ${index + 1}:
Title: ${result.title}
URL: ${result.url}
Description: ${result.description}
Source: ${result.meta_url?.hostname || "Unknown"}
${result.page_age ? `Published: ${result.page_age}` : ""}
`;
  }).join("\n---\n\n");

  const prompt = `Based on the following search results for the query "${searchResults.query?.original || "unknown"}", provide a concise summary that:

1. Synthesizes the key information from all results
2. Highlights the most important points
3. Notes any consensus or conflicting information
4. Includes source citations (use the URLs provided)
5. Keeps the summary under 300 words

Search Results:
${resultsText}

Summary:`;

  try {
    // Use LLM to generate summary
    let summary = "";
    for await (const chunk of streamChat({
      providerId: "gemini-flash",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    })) {
      if (chunk.type === "text") {
        summary += chunk.text;
      }
    }

    return summary.trim() || "Unable to generate summary.";
  } catch (error) {
    console.error("[Search Summarizer] Error:", error);
    return "Unable to generate summary due to an error.";
  }
}

/**
 * Extract key points from search results
 */
export function extractKeyPoints(searchResults: SearchApiResponse): string[] {
  if (!searchResults.results || searchResults.results.length === 0) {
    return [];
  }

  const keyPoints: string[] = [];
  const seenPoints = new Set<string>();

  for (const result of searchResults.results.slice(0, 10)) {
    // Extract key sentences from descriptions
    const sentences = result.description
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 200);

    for (const sentence of sentences.slice(0, 2)) {
      const normalized = sentence.toLowerCase();
      if (!seenPoints.has(normalized)) {
        keyPoints.push(sentence);
        seenPoints.add(normalized);
        if (keyPoints.length >= 10) break;
      }
    }
    if (keyPoints.length >= 10) break;
  }

  return keyPoints;
}

