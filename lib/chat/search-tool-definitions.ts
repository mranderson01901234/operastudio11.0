/**
 * Web search tool definitions for Gemini function calling.
 * These tools allow the LLM to search the web using Brave Search API.
 */

import type { ToolDefinition } from "./tool-definitions";

/**
 * Web search tools available to all users.
 * These tools are always available and don't require any account connection.
 */
export const SEARCH_TOOLS: ToolDefinition[] = [
  {
    name: "web_search",
    description: "Search the web using Brave Search API. Use this tool to find current information, look up facts, research topics, find websites, podcasts, YouTube videos, or get up-to-date information from the internet. Returns search results automatically categorized into: articles (websites/blogs), youtube_videos (if found), and podcasts (if found). CRITICAL: When presenting results, you MUST: 1) Format ALL sources as clickable markdown links [Source Name](URL) - NEVER write '(Source: Name)', always use [Name](URL). 2) Include ALL result types from the search response: articles, youtube_videos (if present), podcasts (if present). 3) Organize clearly: Articles first, then 'YouTube Videos:' section, then 'Podcasts:' section. 4) Only include content directly relevant to the query - filter out off-topic results. WORKFLOW INTEGRATION: This tool can be chained with other tools - for example, you can search the web and then use fs_write to save results to a file, or use email_send to email the results. When users ask to 'search and save' or 'search and create a document', use web_search first, then process the results and use fs_write to save them.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query string. Be specific and clear to get the best results. Examples: 'TypeScript best practices 2024', 'latest news about AI', 'how to use React hooks'"
        },
        count: {
          type: "number",
          description: "Number of results to return (1-20, default: 10). Use fewer results for quick searches, more for comprehensive research."
        },
        offset: {
          type: "number",
          description: "Pagination offset for getting more results (default: 0). Use this to get the next page of results."
        },
        safesearch: {
          type: "string",
          description: "Safe search filter: 'strict' (most restrictive), 'moderate' (default), or 'off' (no filtering). Use 'strict' for family-friendly content, 'off' for unrestricted results."
        },
        freshness: {
          type: "string",
          description: "Filter results by recency: 'pd' (past day), 'pw' (past week), 'pm' (past month), 'py' (past year). Use this for time-sensitive queries like news or recent events."
        },
        country: {
          type: "string",
          description: "ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB', 'CA') to bias results toward a specific country. Optional."
        },
        search_lang: {
          type: "string",
          description: "ISO 639-1 language code (e.g., 'en', 'es', 'fr') to search in a specific language. Optional, defaults to 'en'."
        }
      },
      required: ["query"]
    }
  },
  {
    name: "web_search_images",
    description: "Search for images using Brave Search API. Use this tool when users ask to find images, pictures, photos, or visual content. Returns image URLs, thumbnails, and source pages. IMPORTANT: When presenting image search results, list them clearly with titles, image URLs, and source pages. Users can click URLs to view images.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Image search query. Be descriptive about what images you're looking for. Examples: 'sunset over mountains', 'TypeScript logo', 'modern office interior design'"
        },
        count: {
          type: "number",
          description: "Number of image results to return (1-20, default: 10)"
        },
        offset: {
          type: "number",
          description: "Pagination offset for getting more results (default: 0)"
        },
        safesearch: {
          type: "string",
          description: "Safe search filter: 'strict' (most restrictive), 'moderate' (default), or 'off' (no filtering). Use 'strict' for family-friendly content."
        },
        country: {
          type: "string",
          description: "ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB', 'CA') to bias results toward a specific country. Optional."
        },
        search_lang: {
          type: "string",
          description: "ISO 639-1 language code (e.g., 'en', 'es', 'fr') to search in a specific language. Optional, defaults to 'en'."
        }
      },
      required: ["query"]
    }
  },
  {
    name: "web_search_news",
    description: "Search for news articles using Brave Search API. Use this tool when users ask about current events, news, recent happenings, or want to stay updated on topics. Returns news articles with titles, URLs, descriptions, publication dates, and source information. IMPORTANT: When presenting news results, include publication dates and source credibility. List results chronologically when relevant.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "News search query. Focus on current events, topics, or news keywords. Examples: 'AI developments 2024', 'latest tech news', 'climate change updates'"
        },
        count: {
          type: "number",
          description: "Number of news articles to return (1-20, default: 10)"
        },
        offset: {
          type: "number",
          description: "Pagination offset for getting more results (default: 0)"
        },
        freshness: {
          type: "string",
          description: "Filter by recency: 'pd' (past day), 'pw' (past week), 'pm' (past month), 'py' (past year). Use 'pd' or 'pw' for breaking news."
        },
        safesearch: {
          type: "string",
          description: "Safe search filter: 'strict' (most restrictive), 'moderate' (default), or 'off' (no filtering)."
        },
        country: {
          type: "string",
          description: "ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB', 'CA') to get news from a specific country. Optional."
        },
        search_lang: {
          type: "string",
          description: "ISO 639-1 language code (e.g., 'en', 'es', 'fr') to search news in a specific language. Optional, defaults to 'en'."
        }
      },
      required: ["query"]
    }
  }
];

