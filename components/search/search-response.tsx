"use client";

import React, { useMemo } from "react";
import { SourceCards } from "./source-cards";
import { CategorizedSections } from "./categorized-sections";
import { RelatedQuestions } from "./related-questions";
import type { SearchResultMetadata } from "@/lib/search/search-result-types";

interface SearchResponseProps {
  metadata: SearchResultMetadata;
  llmContent: string; // LLM-generated markdown/text content
  onQuestionClick?: (question: string) => void;
}

/**
 * Main container for Perplexity-style search response
 * Orchestrates all sub-components
 */
export function SearchResponse({
  metadata,
  llmContent,
  onQuestionClick,
}: SearchResponseProps) {
  // Extract related questions from LLM content if present
  const relatedQuestions = useMemo(() => {
    // Look for "Related" section in content
    const relatedMatch = llmContent.match(/##?\s*Related\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (relatedMatch) {
      const questionsText = relatedMatch[1];
      // Extract questions (lines starting with -, *, or numbers)
      const questionLines = questionsText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => {
          const cleaned = line.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, "");
          return cleaned.length > 10; // Filter out short lines
        })
        .map((line) => line.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, ""))
        .slice(0, 5); // Limit to 5 questions

      return questionLines.length > 0 ? questionLines : metadata.relatedQuestions || [];
    }

    return metadata.relatedQuestions || [];
  }, [llmContent, metadata.relatedQuestions]);

  // Remove related questions section from content if present
  const contentWithoutRelated = useMemo(() => {
    return llmContent.replace(/##?\s*Related\s*\n[\s\S]*$/i, "").trim();
  }, [llmContent]);

  return (
    <div className="w-full space-y-4">
      {/* Source Cards Row */}
      <SourceCards results={metadata.results} maxVisible={4} />

      {/* Categorized Sections */}
      <CategorizedSections content={contentWithoutRelated} results={metadata.results} />

      {/* Related Questions */}
      {relatedQuestions.length > 0 && (
        <RelatedQuestions
          questions={relatedQuestions}
          onQuestionClick={onQuestionClick}
        />
      )}
    </div>
  );
}

