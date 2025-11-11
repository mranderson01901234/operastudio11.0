/**
 * TypeScript types for Brave Search API integration
 */

export interface BraveSearchParams {
  q: string;
  count?: number;
  offset?: number;
  safesearch?: "strict" | "moderate" | "off";
  freshness?: "pd" | "pw" | "pm" | "py";
  country?: string;
  search_lang?: string;
  ui_lang?: string;
  text_decorations?: boolean;
  spellcheck?: boolean;
}

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  page_age?: string;
  language?: string;
  family_friendly: boolean;
  type: string;
  subtype: string;
  meta_url: {
    hostname: string;
    path: string;
    scheme: string;
  };
  age?: string;
}

export interface BraveSearchResponse {
  query: {
    original: string;
    show_strict_warning: boolean;
    is_navigational: boolean;
    is_news_breaking: boolean;
    altered?: {
      query: string;
      skipped_alter: boolean;
    };
  };
  web: {
    results: BraveSearchResult[];
    count: number;
    total: number;
  };
}

export interface SearchApiResponse {
  results: BraveSearchResult[];
  total: number;
  count: number;
  query: {
    original: string;
    altered?: string;
  };
}

export interface BraveImageResult {
  title: string;
  url: string;
  thumbnail?: {
    src: string;
    width?: number;
    height?: number;
  };
  properties?: {
    url: string;
    width?: number;
    height?: number;
  };
  age?: string;
  meta_url?: {
    hostname: string;
    path: string;
  };
}

export interface BraveNewsResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  meta_url?: {
    hostname: string;
    path: string;
  };
  thumbnail?: {
    src: string;
    width?: number;
    height?: number;
  };
  breaking?: boolean;
}

export interface ImageSearchApiResponse {
  results: BraveImageResult[];
  total: number;
  count: number;
  query: {
    original: string;
    altered?: string;
  };
}

export interface NewsSearchApiResponse {
  results: BraveNewsResult[];
  total: number;
  count: number;
  query: {
    original: string;
    altered?: string;
  };
}

