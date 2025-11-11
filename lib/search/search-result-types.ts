/**
 * TypeScript types for Perplexity-style search result rendering
 */

export interface SearchResultItem {
  title: string;
  url: string;
  description: string;
  hostname: string;
  thumbnail?: string;
  page_age?: string;
  index: number;
}

export interface SearchResultCategory {
  name: string;
  content: string; // LLM-generated text for this category
  sources: number[]; // Indices into results array
}

export interface SearchResultMetadata {
  query: string;
  total: number;
  count: number;
  results: SearchResultItem[];
  categories?: SearchResultCategory[];
  relatedQuestions?: string[];
}

/**
 * New Perplexity-style Answer view payload
 */
export interface SearchAnswerPayload {
  // Core data
  query: string;
  mode: "answer" | "videos" | "listen";
  
  // Sources
  sources: Array<{
    url: string;
    title: string;
    favicon?: string;
    thumbnail?: string;  // Hero image or company logo
    tag?: string;
    description?: string;
  }>;
  
  // Content sections
  sections: Array<{
    heading: string;
    summary?: string; // Brief summary of the section
    bullets: Array<{
      text: string;
      sourceIndex?: number;
    }>;
  }>;
  
  // Metadata
  stepsCaption?: string;
  followups?: string[];
}

