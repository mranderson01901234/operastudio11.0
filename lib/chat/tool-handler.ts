/**
 * Tool call handler for executing MCP tools and email tools.
 * Handles detection and execution of function calls from the LLM.
 */

import { formatSearchResultsForLLM } from "@/lib/search/formatter";
import { getBestImageUrl, enhanceImageUrl } from "@/lib/search/image-utils";
import { recoverFromError } from "@/lib/utils/error-recovery";

// Type definitions for interceptor (server-only module)
type InterceptToolCall = (
  toolCall: ToolCall,
  workingDir?: string
) => Promise<{
  modified: boolean;
  toolCall: ToolCall;
  confidence: number;
  corrections: Array<{
    parameter: string;
    originalValue: string;
    correctedValue: string;
    reason: string;
  }>;
  warnings: string[];
}>;

type LogCorrection = (
  toolCall: ToolCall,
  result: Awaited<ReturnType<InterceptToolCall>>,
  success: boolean,
  error?: string
) => void;

// Type definition for batch validator (server-only module)
type ValidateBatchOperation = (
  operation: "delete" | "move" | "copy" | "modify",
  pattern: string | RegExp,
  basePath: string,
  options?: {
    recursive?: boolean;
    maxDepth?: number;
    fileTypes?: string[];
    excludePatterns?: string[];
  }
) => Promise<{
  operation: string;
  targets: Array<{
    path: string;
    type: "file" | "directory";
    size?: number;
    matchReason: string;
  }>;
  totalSize: number;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  warnings: string[];
  estimatedTime: number;
  safetyLevel: "safe" | "moderate" | "dangerous";
}>;

// Lazy load interceptor only on server-side (it uses Node.js fs/promises)
async function getInterceptor(): Promise<{
  interceptToolCall: InterceptToolCall | null;
  logCorrection: LogCorrection | null;
}> {
  // Only load on server-side
  if (typeof window !== "undefined") {
    return { interceptToolCall: null, logCorrection: null };
  }

  try {
    const interceptorModule = await import("@/lib/utils/tool-call-interceptor");
    return {
      interceptToolCall: interceptorModule.interceptToolCall,
      logCorrection: interceptorModule.logCorrection,
    };
  } catch (error) {
    // Interceptor not available (e.g., in client bundle or build error)
    console.warn("[Tool Handler] Interceptor not available:", error);
    return { interceptToolCall: null, logCorrection: null };
  }
}

// Lazy load batch validator only on server-side (it uses Node.js fs/promises)
async function getBatchValidator(): Promise<{
  validateBatchOperation: ValidateBatchOperation | null;
}> {
  // Only load on server-side
  if (typeof window !== "undefined") {
    return { validateBatchOperation: null };
  }

  try {
    const batchValidatorModule = await import("@/lib/utils/batch-validator");
    return {
      validateBatchOperation: batchValidatorModule.validateBatchOperation,
    };
  } catch (error) {
    // Batch validator not available (e.g., in client bundle or build error)
    console.warn("[Tool Handler] Batch validator not available:", error);
    return { validateBatchOperation: null };
  }
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  result: unknown;
  error?: string;
  errorCode?: string;
  batchValidation?: {
    requiresConfirmation: boolean;
    safetyLevel: "safe" | "moderate" | "dangerous";
    warnings: string[];
    targetCount: number;
    totalSize: number;
  };
}

/**
 * Execute an email tool call via email API routes.
 * @param toolCall The email tool call to execute
 */
async function executeEmailToolCall(toolCall: ToolCall): Promise<ToolResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000); // 60 second timeout

    try {
      // Map email tool names to API endpoints
      const emailToolEndpoints: Record<string, { method: string; path: string }> = {
        email_list: { method: "GET", path: "/api/email/list" },
        email_get: { method: "GET", path: "/api/email/[id]" },
        email_send: { method: "POST", path: "/api/email/send" },
        email_reply: { method: "POST", path: "/api/email/reply" },
        email_archive: { method: "POST", path: "/api/email/archive" },
        email_delete: { method: "POST", path: "/api/email/delete" },
        email_mark_read: { method: "POST", path: "/api/email/mark-read" },
      };

      const endpoint = emailToolEndpoints[toolCall.name];
      if (!endpoint) {
        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: `Unknown email tool: ${toolCall.name}`,
        };
      }

      // Build URL and request options
      let url = endpoint.path;
      const options: RequestInit = {
        method: endpoint.method,
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      };

      // Handle GET requests with query parameters
      if (endpoint.method === "GET") {
        const params = new URLSearchParams();
        if (toolCall.name === "email_list") {
          if (toolCall.arguments.folder) params.set("folder", String(toolCall.arguments.folder));
          if (toolCall.arguments.query) params.set("q", String(toolCall.arguments.query));
          if (toolCall.arguments.maxResults) params.set("maxResults", String(toolCall.arguments.maxResults));
          if (toolCall.arguments.pageToken) params.set("pageToken", String(toolCall.arguments.pageToken));
          url = `${endpoint.path}?${params.toString()}`;
        } else if (toolCall.name === "email_get") {
          // Replace [id] with actual email ID
          const emailId = toolCall.arguments.emailId;
          if (!emailId) {
            return {
              callId: toolCall.id,
              name: toolCall.name,
              result: null,
              error: "emailId is required for email_get",
            };
          }
          url = `/api/email/${emailId}`;
        }
      } else {
        // POST requests - include body
        options.body = JSON.stringify(toolCall.arguments);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        let errorMessage = errorData.error || "Email operation failed";

        if (response.status === 401) {
          errorMessage = "Unauthorized. Please ensure you're logged in.";
        } else if (response.status === 404) {
          if (toolCall.name === "email_get") {
            errorMessage = `Email not found: ${toolCall.arguments.emailId}`;
          } else {
            errorMessage = "Email account not found. Please connect your Gmail account first.";
          }
        } else if (response.status === 400) {
          errorMessage = `Invalid request: ${errorData.error || "Check tool arguments"}`;
        }

        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: errorMessage,
          errorCode: response.status.toString(),
        };
      }

      const result = await response.json();

      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: result,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        throw new Error("Email operation timed out after 60 seconds");
      }
      throw fetchError;
    }
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof TypeError && error.message.includes("fetch")) {
      errorMessage = "Network error: Unable to reach email API. Check your connection.";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: errorMessage,
    };
  }
}

/**
 * Execute a GitHub tool call via GitHub API routes.
 * @param toolCall The GitHub tool call to execute
 */
async function executeGitHubToolCall(toolCall: ToolCall): Promise<ToolResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000); // 60 second timeout

    try {
      // Map GitHub tool names to API endpoints
      const githubToolEndpoints: Record<string, { method: string; pathBuilder: (args: Record<string, unknown>) => string }> = {
        github_list_repos: {
          method: "GET",
          pathBuilder: (args) => {
            const params = new URLSearchParams();
            if (args.type) params.set("type", String(args.type));
            if (args.sort) params.set("sort", String(args.sort));
            if (args.direction) params.set("direction", String(args.direction));
            if (args.per_page) params.set("per_page", String(args.per_page));
            if (args.page) params.set("page", String(args.page));
            return `/api/github/repos${params.toString() ? `?${params.toString()}` : ""}`;
          }
        },
        github_get_repo: {
          method: "GET",
          pathBuilder: (args) => {
            const owner = encodeURIComponent(String(args.owner || ""));
            const repo = encodeURIComponent(encodeURIComponent(String(args.repo || "")));
            return `/api/github/repo/${owner}/${repo}`;
          }
        },
        github_list_files: {
          method: "GET",
          pathBuilder: (args) => {
            const owner = encodeURIComponent(String(args.owner || ""));
            const repo = encodeURIComponent(encodeURIComponent(String(args.repo || "")));
            const params = new URLSearchParams();
            if (args.path) params.set("path", String(args.path));
            if (args.ref) params.set("ref", String(args.ref));
            return `/api/github/repo/${owner}/${repo}/files${params.toString() ? `?${params.toString()}` : ""}`;
          }
        },
        github_read_file: {
          method: "GET",
          pathBuilder: (args) => {
            const owner = encodeURIComponent(String(args.owner || ""));
            const repo = encodeURIComponent(encodeURIComponent(String(args.repo || "")));
            const params = new URLSearchParams();
            if (args.path) params.set("path", String(args.path));
            if (args.ref) params.set("ref", String(args.ref));
            return `/api/github/repo/${owner}/${repo}/file${params.toString() ? `?${params.toString()}` : ""}`;
          }
        },
        github_write_file: {
          method: "POST",
          pathBuilder: (args) => {
            const owner = encodeURIComponent(String(args.owner || ""));
            const repo = encodeURIComponent(encodeURIComponent(String(args.repo || "")));
            return `/api/github/repo/${owner}/${repo}/file`;
          }
        },
        github_list_commits: {
          method: "GET",
          pathBuilder: (args) => {
            const owner = encodeURIComponent(String(args.owner || ""));
            const repo = encodeURIComponent(encodeURIComponent(String(args.repo || "")));
            const params = new URLSearchParams();
            if (args.sha) params.set("sha", String(args.sha));
            if (args.path) params.set("path", String(args.path));
            if (args.author) params.set("author", String(args.author));
            if (args.since) params.set("since", String(args.since));
            if (args.until) params.set("until", String(args.until));
            if (args.per_page) params.set("per_page", String(args.per_page));
            if (args.page) params.set("page", String(args.page));
            return `/api/github/repo/${owner}/${repo}/commits${params.toString() ? `?${params.toString()}` : ""}`;
          }
        },
        github_create_issue: {
          method: "POST",
          pathBuilder: (args) => {
            const owner = encodeURIComponent(String(args.owner || ""));
            const repo = encodeURIComponent(encodeURIComponent(String(args.repo || "")));
            return `/api/github/repo/${owner}/${repo}/issues`;
          }
        },
        github_list_issues: {
          method: "GET",
          pathBuilder: (args) => {
            const owner = encodeURIComponent(String(args.owner || ""));
            const repo = encodeURIComponent(encodeURIComponent(String(args.repo || "")));
            const params = new URLSearchParams();
            if (args.state) params.set("state", String(args.state));
            if (args.labels) params.set("labels", String(args.labels));
            if (args.sort) params.set("sort", String(args.sort));
            if (args.direction) params.set("direction", String(args.direction));
            if (args.per_page) params.set("per_page", String(args.per_page));
            if (args.page) params.set("page", String(args.page));
            return `/api/github/repo/${owner}/${repo}/issues${params.toString() ? `?${params.toString()}` : ""}`;
          }
        },
        github_create_pr: {
          method: "POST",
          pathBuilder: (args) => {
            const owner = encodeURIComponent(String(args.owner || ""));
            const repo = encodeURIComponent(encodeURIComponent(String(args.repo || "")));
            return `/api/github/repo/${owner}/${repo}/pulls`;
          }
        },
        github_list_prs: {
          method: "GET",
          pathBuilder: (args) => {
            const owner = encodeURIComponent(String(args.owner || ""));
            const repo = encodeURIComponent(encodeURIComponent(String(args.repo || "")));
            const params = new URLSearchParams();
            if (args.state) params.set("state", String(args.state));
            if (args.head) params.set("head", String(args.head));
            if (args.base) params.set("base", String(args.base));
            if (args.sort) params.set("sort", String(args.sort));
            if (args.direction) params.set("direction", String(args.direction));
            if (args.per_page) params.set("per_page", String(args.per_page));
            if (args.page) params.set("page", String(args.page));
            return `/api/github/repo/${owner}/${repo}/pulls${params.toString() ? `?${params.toString()}` : ""}`;
          }
        },
        github_list_workflows: {
          method: "GET",
          pathBuilder: (args) => {
            const owner = encodeURIComponent(String(args.owner || ""));
            const repo = encodeURIComponent(encodeURIComponent(String(args.repo || "")));
            const params = new URLSearchParams();
            if (args.branch) params.set("branch", String(args.branch));
            if (args.status) params.set("status", String(args.status));
            if (args.event) params.set("event", String(args.event));
            if (args.actor) params.set("actor", String(args.actor));
            if (args.per_page) params.set("per_page", String(args.per_page));
            if (args.page) params.set("page", String(args.page));
            return `/api/github/repo/${owner}/${repo}/actions/runs${params.toString() ? `?${params.toString()}` : ""}`;
          }
        },
      };

      const endpoint = githubToolEndpoints[toolCall.name];
      if (!endpoint) {
        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: `Unknown GitHub tool: ${toolCall.name}`,
        };
      }

      // Build URL using path builder
      const url = endpoint.pathBuilder(toolCall.arguments);
      const options: RequestInit = {
        method: endpoint.method,
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      };

      // Handle POST/PUT requests - include body
      if (endpoint.method === "POST" || endpoint.method === "PUT") {
        options.body = JSON.stringify(toolCall.arguments);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        let errorMessage = errorData.error || "GitHub operation failed";

        if (response.status === 401) {
          errorMessage = "Unauthorized. Please ensure you're logged in and your GitHub account is connected.";
        } else if (response.status === 404) {
          if (toolCall.name === "github_get_repo" || toolCall.name === "github_read_file" || toolCall.name === "github_list_files") {
            errorMessage = `Repository or resource not found: ${toolCall.arguments.owner}/${toolCall.arguments.repo}. It may have been deleted or you don't have access to it.`;
          } else if (toolCall.name === "github_write_file") {
            errorMessage = `File not found or cannot be updated: ${toolCall.arguments.owner}/${toolCall.arguments.repo}/${toolCall.arguments.path}. Check that:\n1. The repository exists and you have write access\n2. The file path is correct\n3. The branch exists (if specified)\n4. You have permission to commit to this repository`;
          } else {
            errorMessage = "GitHub resource not found. Please check the repository name and your access permissions.";
          }
        } else if (response.status === 400) {
          errorMessage = `Invalid request: ${errorData.error || "Check tool arguments"}`;
        } else if (response.status === 403) {
          errorMessage = "Permission denied. You may not have access to this repository or the required GitHub permissions.";
        }

        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: errorMessage,
          errorCode: response.status.toString(),
        };
      }

      const result = await response.json();

      // Invalidate cache for GitHub file writes
      if (toolCall.name === "github_write_file" && result._cacheInvalidate) {
        const { owner, repo, path } = result._cacheInvalidate;
        // Dispatch event to invalidate cache (handled by components)
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("github-file-updated", {
            detail: { owner, repo, path }
          }));
        }
        // Remove _cacheInvalidate from result before returning
        delete result._cacheInvalidate;
      }

      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: result,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        throw new Error("GitHub operation timed out after 60 seconds");
      }
      throw fetchError;
    }
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof TypeError && error.message.includes("fetch")) {
      errorMessage = "Network error: Unable to reach GitHub API. Check your connection.";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: errorMessage,
    };
  }
}

/**
 * Execute an Imagen editing tool call via direct API routes (like email/GitHub)
 * @param toolCall The Imagen editing tool call to execute
 * @param userId User ID (for logging, actual auth handled by API routes)
 */
async function executeImagenEditToolCall(
  toolCall: ToolCall,
  userId: string
): Promise<ToolResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000); // 60 second timeout

    try {
      // Map tool names to API endpoints (like email tools)
      const endpointMap: Record<string, string> = {
        imagen_filter: "/api/imagen/filter",
        imagen_crop: "/api/imagen/crop",
        imagen_resize: "/api/imagen/resize",
        imagen_adjust: "/api/imagen/adjust",
        imagen_rotate: "/api/imagen/rotate",
        imagen_format: "/api/imagen/format",
      };

      const endpoint = endpointMap[toolCall.name];
      if (!endpoint) {
        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: `Unknown image editing tool: ${toolCall.name}`,
        };
      }

      // Call API route directly (no MCP indirection)
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toolCall.arguments),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        let errorMessage = errorData.error || "Image editing failed";

        if (response.status === 401) {
          errorMessage = "Unauthorized. Please ensure you're logged in.";
        } else if (response.status === 404) {
          errorMessage = `Image not found. The image may have been deleted or you don't have access to it.`;
        } else if (response.status === 400) {
          errorMessage = `Invalid request: ${errorMessage}`;
        }

        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: errorMessage,
          errorCode: response.status.toString(),
        };
      }

      const result = await response.json();

      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: result,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        throw new Error("Image editing operation timed out after 60 seconds");
      }
      throw fetchError;
    }
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof TypeError && error.message.includes("fetch")) {
      errorMessage = "Network error: Unable to reach image editing API. Check your connection.";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: errorMessage,
    };
  }
}

/**
 * Execute an MCP tool call via MCP proxy API
 * @param toolCall The tool call to execute
 * @param sessionId Optional session ID (if not provided, uses default routing)
 */
async function executeMCPToolCall(
  toolCall: ToolCall,
  sessionId?: string
): Promise<ToolResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000); // 60 second timeout

    try {
      const body: { tool: string; arguments: Record<string, unknown>; sessionId?: string } = {
        tool: toolCall.name,
        arguments: toolCall.arguments,
      };

      // Include sessionId if provided (for explicit routing)
      if (sessionId) {
        body.sessionId = sessionId;
      }

      const response = await fetch("/api/mcp/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        let errorMessage = errorData.error || "MCP tool execution failed";

        if (response.status === 404) {
          errorMessage =
            "MCP session not found. Please start the appropriate MCP session first.";
        } else if (response.status === 400) {
          errorMessage = `Invalid request: ${errorMessage}`;
        } else if (response.status === 503) {
          errorMessage =
            "MCP server unavailable. The server may have crashed or disconnected.";
        }

        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: errorMessage,
          errorCode: response.status.toString(),
        };
      }

      const result = await response.json();

      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: result,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        throw new Error("MCP tool execution timed out after 60 seconds");
      }
      throw fetchError;
    }
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof TypeError && error.message.includes("fetch")) {
      errorMessage =
        "Network error: Unable to reach MCP server. Check your connection.";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: errorMessage,
    };
  }
}

/**
 * Execute a web search tool call via search API route.
 * @param toolCall The web search tool call to execute
 * @param endpoint Optional custom endpoint (default: /api/search)
 */
async function executeSearchToolCall(toolCall: ToolCall, endpoint: string = "/api/search"): Promise<ToolResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000); // 30 second timeout

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toolCall.arguments),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        let errorMessage = errorData.error || "Web search failed";

        if (response.status === 401) {
          errorMessage = "Unauthorized. Please ensure you're logged in.";
        } else if (response.status === 400) {
          errorMessage = `Invalid search request: ${errorMessage}`;
        } else if (response.status === 429) {
          errorMessage = "Search rate limit exceeded. Please try again later.";
        } else if (response.status === 504) {
          errorMessage = "Search request timed out. Please try again.";
        }

        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: errorMessage,
          errorCode: response.status.toString(),
        };
      }

      const result = await response.json();

      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: result,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        throw new Error("Web search timed out after 30 seconds");
      }
      throw fetchError;
    }
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof TypeError && error.message.includes("fetch")) {
      errorMessage = "Network error: Unable to reach search API. Check your connection.";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: errorMessage,
    };
  }
}

/**
 * Execute an Imagen tool call via Imagen API route.
 * @param toolCall The Imagen tool call to execute
 */
async function executeImagenToolCall(toolCall: ToolCall): Promise<ToolResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 120000); // 2 minute timeout (image generation can take longer)

    try {
      const response = await fetch("/api/imagen/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toolCall.arguments),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));

        console.error("[Tool Handler] Imagen API error:");
        console.error("  Status:", response.status, response.statusText);
        console.error("  Error Data:", JSON.stringify(errorData, null, 2));
        console.error("  Request Body:", JSON.stringify(toolCall.arguments, null, 2));

        let errorMessage = errorData.error || errorData.message || "Image generation failed";
        
        // Include additional details if available
        if (errorData.received) {
          errorMessage += ` (Received: ${JSON.stringify(errorData.received)})`;
        }
        if (errorData.details) {
          errorMessage += ` (Details: ${errorData.details})`;
        }

        if (response.status === 400) {
          if (errorData.code === "SAFETY_FILTER_BLOCKED") {
            errorMessage = "Content blocked by safety filter. Please modify your prompt to avoid prohibited content.";
          } else {
            errorMessage = `Invalid request: ${errorMessage}`;
          }
        } else if (response.status === 429) {
          errorMessage = "Rate limit exceeded. Please wait a moment before generating more images.";
        }

        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: errorMessage,
          errorCode: response.status.toString(),
        };
      }

      const result = await response.json();

      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: result,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        throw new Error("Image generation timed out after 2 minutes");
      }
      throw fetchError;
    }
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof TypeError && error.message.includes("fetch")) {
      errorMessage = "Network error: Unable to reach image generation API. Check your connection.";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      callId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: errorMessage,
    };
  }
}

/**
 * Execute a tool call via the MCP proxy API, email API, GitHub API, or Imagen API.
 * Routes email tools to email API, GitHub tools to GitHub API, imagen tools to Imagen API, file system tools to MCP proxy.
 * @param toolCall The tool call to execute
 * @param retryCount Internal counter to prevent infinite retry loops (max 1 retry)
 * @param userId Optional user ID for session routing (required for MCP tools)
 * @param workingDir Current working directory for path resolution (default: process.cwd())
 */
export async function executeToolCall(
  toolCall: ToolCall,
  retryCount: number = 0,
  userId?: string,
  workingDir?: string
): Promise<ToolResult> {
  // === UNDO/ROLLBACK: Create snapshot before destructive operations ===
  let snapshot: { id: string; timestamp: number; operation: string; targetPath: string; backupPath: string | null; canRestore: boolean } | null = null;
  const destructiveOperations = ["fs_write", "fs_delete"];
  if (destructiveOperations.includes(toolCall.name)) {
    const targetPath = toolCall.arguments.path as string | undefined;
    if (targetPath) {
      try {
        // Call snapshot API (server-side only)
        const snapshotResponse = await fetch("/api/snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: toolCall.name === "fs_delete" ? "delete" : "write",
            targetPath,
          }),
        });
        
        if (snapshotResponse.ok) {
          const snapshotData = await snapshotResponse.json();
          if (snapshotData.success && snapshotData.snapshot) {
            snapshot = snapshotData.snapshot;
            console.log(`[Undo/Rollback] 📸 Created snapshot before ${toolCall.name}: ${targetPath}`);
          }
        }
      } catch (error) {
        console.error(`[Undo/Rollback] Failed to create snapshot:`, error);
        // Continue execution even if snapshot fails
      }
    }
  }

  // === BATCH VALIDATOR: Check for batch operations ===
  let batchValidation: ToolResult["batchValidation"] = undefined;
  if (toolCall.name === "fs_delete" && toolCall.arguments.recursive) {
    const targetPath = toolCall.arguments.path as string | undefined;
    if (targetPath) {
      try {
        const { validateBatchOperation: validateFn } = await getBatchValidator();
        if (validateFn) {
          const validation = await validateFn("delete", targetPath, targetPath, {
            recursive: true,
          });
          
          // Store validation details to include in result
          batchValidation = {
            requiresConfirmation: validation.requiresConfirmation,
            safetyLevel: validation.safetyLevel,
            warnings: validation.warnings,
            targetCount: validation.targets.length,
            totalSize: validation.totalSize,
          };
          
          if (validation.safetyLevel === "dangerous" && validation.requiresConfirmation) {
            console.warn(`[Batch Validator] ⚠️ Dangerous batch operation detected:`, validation);
            // Note: Full confirmation UI integration pending - for now, warnings are included in result
          }
        }
      } catch (error) {
        console.error(`[Batch Validator] Validation failed:`, error);
        // Continue execution even if validation fails
      }
    }
  }

  // === TOOL CALL INTERCEPTOR ===
  // Validate and auto-correct filesystem tool calls before execution
  const fileSystemTools = ["fs_read", "fs_write", "fs_list", "fs_delete", "change_directory"];
  let interceptionResult: Awaited<ReturnType<InterceptToolCall>> | null = null;

  if (fileSystemTools.includes(toolCall.name)) {
    const { interceptToolCall: interceptFn } = await getInterceptor();
    if (interceptFn) {
      try {
        interceptionResult = await interceptFn(toolCall, workingDir || process.cwd());

        // Log corrections if any were made
        if (interceptionResult.modified) {
          console.log(`[Tool Interceptor] Auto-corrected ${toolCall.name}:`, {
          corrections: interceptionResult.corrections,
          confidence: interceptionResult.confidence,
        });

        // Log warnings for user visibility
        if (interceptionResult.warnings.length > 0) {
          console.warn(`[Tool Interceptor] Warnings:`, interceptionResult.warnings);
        }
      }

      // Check confidence level for destructive operations
      if (toolCall.name === "fs_delete" || toolCall.name === "fs_write") {
        if (interceptionResult.confidence < 0.9) {
          // Low confidence on destructive operation - block it
          const errorMsg = [
            `⚠️ Low confidence (${Math.round(interceptionResult.confidence * 100)}%) for ${toolCall.name === "fs_delete" ? "delete" : "write"} operation.`,
            ...interceptionResult.warnings,
            `Original path: ${toolCall.arguments.path}`,
            interceptionResult.corrections.length > 0
              ? `Suggested path: ${interceptionResult.corrections[0].correctedValue}`
              : "No correction available.",
            "",
            "Please verify the path and try again with an exact path."
          ].join("\n");

          // Log failed correction
          if (interceptionResult.modified) {
            const { logCorrection: logFn } = await getInterceptor();
            if (logFn) {
              logFn(toolCall, interceptionResult, false, errorMsg);
            }
          }

          return {
            callId: toolCall.id,
            name: toolCall.name,
            result: null,
            error: errorMsg,
          };
        }
      }

      // Use the potentially corrected tool call
      toolCall = interceptionResult.toolCall;

      // Show corrections to user if made
      if (interceptionResult.modified && interceptionResult.corrections.length > 0) {
        const correction = interceptionResult.corrections[0];
        console.log(
          `[Tool Interceptor] 🔄 Auto-corrected: "${correction.originalValue}" → "${correction.correctedValue}" (${correction.reason})`
        );
      }
      } catch (interceptionError) {
        // If interceptor fails, log and continue with original tool call
        console.error("[Tool Interceptor] Interception failed:", interceptionError);
        interceptionResult = null;
      }
    }
  }

  // === UNDO TOOL: Handle undo operations ===
  if (toolCall.name === "undo") {
    try {
      // Call undo API (server-side only)
      const undoResponse = await fetch("/api/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      const undoResult = await undoResponse.json();
      
      if (undoResult.success) {
        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: {
            success: true,
            message: undoResult.message,
            operation: undoResult.operation,
          },
        };
      } else {
        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: null,
          error: undoResult.error || "Failed to undo operation",
        };
      }
    } catch (error) {
      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: error instanceof Error ? error.message : "Unknown error during undo",
      };
    }
  }

  // Special case: imagen_generate goes to API route (not MCP)
  // NOTE: This tool should NOT be available when currentImageId exists (handled in route.ts)
  if (toolCall.name === "imagen_generate") {
    return executeImagenToolCall(toolCall);
  }

  // Route imagen editing tools via session router (MCP)
  if (
    toolCall.name.startsWith("imagen_") &&
    toolCall.name !== "imagen_generate"
  ) {
    if (!userId) {
      return {
        callId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: "User ID required for image editing tools. Please ensure you're authenticated.",
      };
    }
    return executeImagenEditToolCall(toolCall, userId);
  }

  // Route email tools to email API
  if (toolCall.name.startsWith("email_")) {
    return executeEmailToolCall(toolCall);
  }

  // Route GitHub tools to GitHub API
  if (toolCall.name.startsWith("github_")) {
    return executeGitHubToolCall(toolCall);
  }

  // Route web search tools to search API
  if (toolCall.name === "web_search") {
    return executeSearchToolCall(toolCall);
  }

  // Route image search tools to image search API
  if (toolCall.name === "web_search_images") {
    return executeSearchToolCall(toolCall, "/api/search/images");
  }

  // Route news search tools to news search API
  if (toolCall.name === "web_search_news") {
    return executeSearchToolCall(toolCall, "/api/search/news");
  }

  // File system tools go through MCP proxy (existing behavior)
  // Use session router if userId is available
  // Note: session-router uses Prisma and is server-only, so we use dynamic import
  // with a computed path to prevent Next.js from statically analyzing it
  if (userId) {
    try {
      // Use template literal to make import path truly dynamic (prevents static analysis)
      const modulePath = `@/lib/mcp/${"session-router"}`;
      const sessionRouter = await import(modulePath);
      const route = await sessionRouter.routeToolCall(toolCall.name, userId);

      if (route) {
        // Route to specific session
        return executeMCPToolCall(toolCall, route.sessionId);
      }
    } catch (error) {
      // If session-router fails to load (e.g., server-only module in client), fall through to MCP proxy
      // This is expected - the MCP proxy API route will handle session routing server-side
      if (process.env.NODE_ENV === "development") {
        console.debug("[Tool Handler] Session router not available, using MCP proxy fallback");
      }
    }
  }

  // Helper function to execute tool call with error recovery
  const executeWithRecovery = async (): Promise<ToolResult> => {
    // Fallback: use existing MCP proxy behavior (for backward compatibility)
    try {
      // Create an AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 60000); // 60 second timeout to match API route timeout + buffer

      try {
        // Call MCP proxy API with timeout
        const response = await fetch("/api/mcp/call", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tool: toolCall.name,
            arguments: toolCall.arguments,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: `HTTP ${response.status}: ${response.statusText}`,
          }));
          
          // Enhanced error messages based on status code
          let errorMessage = errorData.error || "Tool execution failed";
          
          if (response.status === 404) {
            // Provide clearer error message based on which tool was called
            if (toolCall.name === "cmd_execute") {
              errorMessage = `MCP session not found. To run commands, you need to start a File System session:\n1. Select 'File System' from the sidebar\n2. Choose a security mode (Safe/Balanced/Unrestricted)\n3. Start the MCP session\n\nNote: cmd_execute can be used from any context (GitHub, Email, or File System) once the session is started.`;
            } else {
              errorMessage = `MCP session not found. Please connect to File System first:\n1. Select 'File System' from the sidebar\n2. Choose a security mode (Safe/Balanced/Unrestricted)\n3. Start the MCP session\n\nOnce connected, file system tools will be available.`;
            }
          } else if (response.status === 403) {
            errorMessage = `Permission denied: ${errorData.error || "Operation not allowed in current security mode"}\n\nTry switching to a more permissive security mode (Balanced or Unrestricted) if you need write access.`;
          } else if (response.status === 503) {
            errorMessage = `MCP server unavailable. The server may have crashed or disconnected.\n\nPlease:\n1. Check if File System is still connected in the sidebar\n2. If disconnected, reconnect by selecting 'File System' and starting a new session\n3. If the issue persists, try restarting the MCP server`;
          } else if (response.status === 504) {
            errorMessage = `Tool execution timed out. The operation took too long to complete.\n\nThis might happen with large files or slow operations. Try:\n1. Breaking the operation into smaller parts\n2. Checking if the file is locked by another process\n3. Retrying the operation`;
          } else if (response.status === 400) {
            errorMessage = `Invalid tool call: ${errorData.error || "Check tool name and arguments"}\n\nVerify:\n1. The tool name is correct (fs_read, fs_write, fs_list, cmd_execute)\n2. All required arguments are provided\n3. Argument types match the expected format`;
          }
          
          const errorResult: ToolResult = {
            callId: toolCall.id,
            name: toolCall.name,
            result: null,
            error: errorMessage,
            errorCode: response.status.toString(),
            batchValidation,
          };

          // === ERROR RECOVERY: Try to recover from error ===
          if (fileSystemTools.includes(toolCall.name) && retryCount === 0) {
            try {
              const recovery = await recoverFromError(
                toolCall,
                errorMessage,
                response.status.toString(),
                async (recoveredCall: ToolCall) => {
                  // Execute recovered tool call
                  return executeToolCall(recoveredCall, retryCount + 1, userId, workingDir);
                },
                true // autoRetryOnly
              );

              if (recovery.recovered && recovery.result) {
                console.log(`[Error Recovery] ✅ Recovered from error: ${recovery.message}`);
                return recovery.result;
              }
            } catch (recoveryError) {
              console.error(`[Error Recovery] Recovery attempt failed:`, recoveryError);
              // Fall through to return original error
            }
          }

          return errorResult;
        }

        const result = await response.json();

        // === LOG SUCCESSFUL CORRECTIONS ===
        if (interceptionResult?.modified) {
          const { logCorrection: logFn } = await getInterceptor();
          if (logFn) {
            logFn(toolCall, interceptionResult, true);
          }
        }

        // Check if result indicates sudo is required
        let parsedResult = result;
        if (typeof result === "string") {
          try {
            parsedResult = JSON.parse(result);
          } catch {
            // Not JSON, use as-is
          }
        }
        
        // Check for SUDO_REQUIRED error and auto-retry with useSudo
        // Check both direct error field and nested error in result
        const errorValue = parsedResult?.error || parsedResult?.result?.error;
        const needsSudo = parsedResult?.needsSudo || parsedResult?.result?.needsSudo;
        
        if ((errorValue === "SUDO_REQUIRED" || needsSudo === true) && 
            toolCall.name === "cmd_execute" && 
            !toolCall.arguments.useSudo &&
            retryCount < 1) { // Prevent infinite retry loops
          console.log(`[Tool Handler] Command requires sudo, automatically retrying with useSudo: true`);
          console.log(`[Tool Handler] Original command: ${toolCall.arguments.command} ${(toolCall.arguments.args as string[])?.join(" ") || ""}`);
          
          // Retry with useSudo: true
          const retryToolCall: ToolCall = {
            ...toolCall,
            arguments: {
              ...toolCall.arguments,
              useSudo: true,
            },
          };
          
          return executeToolCall(retryToolCall, retryCount + 1);
        }
        
        // Also check for permission denied errors in stderr
        if (toolCall.name === "cmd_execute" && 
            !toolCall.arguments.useSudo &&
            parsedResult?.result &&
            retryCount < 1) { // Prevent infinite retry loops
          const stderr = parsedResult.result.stderr || "";
          const exitCode = parsedResult.result.exitCode;
          
          if ((stderr.includes("Permission denied") || 
               stderr.includes("EACCES") ||
               stderr.includes("permission") ||
               (exitCode !== 0 && stderr.includes("sudo"))) &&
              !stderr.includes("SUDO_REQUIRED")) {
            console.log(`[Tool Handler] Detected permission error, automatically retrying with useSudo: true`);
            console.log(`[Tool Handler] Error: ${stderr.slice(0, 200)}`);
            
            const retryToolCall: ToolCall = {
              ...toolCall,
              arguments: {
                ...toolCall.arguments,
                useSudo: true,
              },
            };
            
            return executeToolCall(retryToolCall, retryCount + 1);
          }
        }
        
        return {
          callId: toolCall.id,
          name: toolCall.name,
          result: parsedResult,
          batchValidation,
        };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          throw new Error("Tool execution timed out after 60 seconds");
        }
        throw fetchError;
      }
    } catch (error) {
      let errorMessage = "Unknown error occurred";
      
      if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "Network error: Unable to reach MCP server. Check your connection.";
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      const errorResult: ToolResult = {
        callId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: errorMessage,
        batchValidation,
      };

      // === ERROR RECOVERY: Try to recover from error ===
      if (fileSystemTools.includes(toolCall.name) && retryCount === 0) {
        try {
          const recovery = await recoverFromError(
            toolCall,
            errorMessage,
            undefined,
            async (recoveredCall: ToolCall) => {
              return executeToolCall(recoveredCall, retryCount + 1, userId, workingDir);
            },
            true // autoRetryOnly
          );

          if (recovery.recovered && recovery.result) {
            console.log(`[Error Recovery] ✅ Recovered from error: ${recovery.message}`);
            return recovery.result;
          }
        } catch (recoveryError) {
          console.error(`[Error Recovery] Recovery attempt failed:`, recoveryError);
          // Fall through to return original error
        }
      }

      return errorResult;
    }
  };

  // Execute with recovery
  const result = await executeWithRecovery();

  // === OPERATION HISTORY: Record operation (success or failure) ===
  if (destructiveOperations.includes(toolCall.name)) {
    try {
      // Call record API (server-side only)
      await fetch("/api/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: toolCall.name,
          args: toolCall.arguments,
          result: result.error ? "error" : "success",
          snapshot: snapshot || undefined,
          error: result.error || undefined,
        }),
      }).catch((err) => {
        console.error(`[Operation History] Failed to record operation:`, err);
      });
      
      if (!result.error) {
        console.log(`[Operation History] ✅ Recorded ${toolCall.name} operation`);
      } else {
        console.log(`[Operation History] ❌ Recorded failed ${toolCall.name} operation`);
      }
    } catch (error) {
      console.error(`[Operation History] Failed to record operation:`, error);
      // Continue even if recording fails
    }
  }

  return result;
}

/**
 * Format tool result for sending back to LLM as function response
 */
export function formatToolResultForLLM(result: ToolResult): string {
  if (result.error) {
    return JSON.stringify({
      error: true,
      message: result.error,
      tool: result.name,
    });
  }
  
  // Format the result nicely
  if (typeof result.result === "string") {
    return result.result;
  }
  
  // For email_list results, format cleanly
  if (result.name === "email_list" && result.result && typeof result.result === "object") {
    const emailResult = result.result as { emails?: Array<{
      id: string;
      threadId?: string;
      from: { name?: string; email: string };
      to?: Array<{ name?: string; email: string }>;
      subject: string;
      date: string;
      snippet?: string;
      unread: boolean;
      labels?: string[];
    }>; nextPageToken?: string | null };
    
    const emails = emailResult.emails || [];
    const count = emails.length;
    
    if (count === 0) {
      return JSON.stringify({
        count: 0,
        message: "No emails found",
        nextPageToken: emailResult.nextPageToken || null,
      });
    }
    
    // Format emails in a clean, concise structure
    const formattedEmails = emails.map((email, index) => ({
      index: index + 1,
      id: email.id,
      from: email.from.name ? `${email.from.name} <${email.from.email}>` : email.from.email,
      subject: email.subject || "(No Subject)",
      date: email.date,
      unread: email.unread,
      snippet: email.snippet ? email.snippet.substring(0, 100) : undefined,
    }));
    
    return JSON.stringify({
      count,
      emails: formattedEmails,
      nextPageToken: emailResult.nextPageToken || null,
    });
  }
  
  // For email_get results, format cleanly
  if (result.name === "email_get" && result.result && typeof result.result === "object") {
    const emailResult = result.result as {
      id: string;
      threadId?: string;
      from: { name?: string; email: string };
      to?: Array<{ name?: string; email: string }>;
      cc?: Array<{ name?: string; email: string }>;
      bcc?: Array<{ name?: string; email: string }>;
      subject: string;
      date: string;
      html?: string;
      text?: string;
      attachments?: Array<{ filename: string; contentType: string; size: number }>;
      unread: boolean;
    };
    
    return JSON.stringify({
      id: emailResult.id,
      from: emailResult.from.name ? `${emailResult.from.name} <${emailResult.from.email}>` : emailResult.from.email,
      to: emailResult.to?.map(t => t.name ? `${t.name} <${t.email}>` : t.email).join(", "),
      cc: emailResult.cc?.map(c => c.name ? `${c.name} <${c.email}>` : c.email).join(", "),
      subject: emailResult.subject || "(No Subject)",
      date: emailResult.date,
      hasHtml: !!emailResult.html,
      hasText: !!emailResult.text,
      body: emailResult.text || emailResult.html || "",
      attachments: emailResult.attachments?.map(a => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
      })),
      unread: emailResult.unread,
    });
  }
  
  // For other email tool results, format simply
  if (result.name.startsWith("email_") && result.result && typeof result.result === "object") {
    const emailResult = result.result as { success?: boolean; messageId?: string; threadId?: string; error?: string };
    
    if (emailResult.success !== false && !emailResult.error) {
      // Success case - return clean success message
      return JSON.stringify({
        success: true,
        ...(emailResult.messageId && { messageId: emailResult.messageId }),
        ...(emailResult.threadId && { threadId: emailResult.threadId }),
      });
    }
  }
  
  // For web_search results, format cleanly using enhanced formatter
  if (result.name === "web_search" && result.result && typeof result.result === "object") {
    const searchResult = result.result as {
      results?: Array<{
        title: string;
        url: string;
        description: string;
        page_age?: string;
        language?: string;
        meta_url?: { hostname: string; path: string };
        type?: string;
      }>;
      total?: number;
      count?: number;
      query?: { original: string; altered?: string };
      cached?: boolean;
    };
    
    // Use enhanced formatter
    return formatSearchResultsForLLM(searchResult);
  }

  // For web_search_images results, format cleanly
  if (result.name === "web_search_images" && result.result && typeof result.result === "object") {
    const imageResult = result.result as {
      results?: Array<{
        title: string;
        url: string;
        thumbnail?: { src: string; width?: number; height?: number };
        properties?: { url: string; width?: number; height?: number };
        meta_url?: { hostname: string; path: string };
        age?: string;
      }>;
      total?: number;
      count?: number;
      query?: { original: string; altered?: string };
      cached?: boolean;
    };
    
    const results = imageResult.results || [];
    const total = imageResult.total || 0;
    const count = imageResult.count || results.length;
    
    if (results.length === 0) {
      return JSON.stringify({
        count: 0,
        total: 0,
        message: "No image results found",
        query: imageResult.query?.original || "unknown",
      });
    }
    
    const formattedResults = results.map((item, index) => {
      // Prefer full image URL over thumbnail for better quality
      const bestImageUrl = getBestImageUrl(
        item.thumbnail?.src,
        item.properties?.url,
        item.meta_url?.hostname
      );
      
      // Enhance image URL to get higher resolution if possible
      const enhancedUrl = bestImageUrl ? enhanceImageUrl(bestImageUrl) : undefined;
      
      return {
        index: index + 1,
        title: item.title || "Untitled Image",
        image_url: enhancedUrl || item.properties?.url || item.url,
        thumbnail_url: item.thumbnail?.src,
        full_image_url: item.properties?.url, // Include full image URL separately
        source_url: item.url,
        hostname: item.meta_url?.hostname,
        dimensions: item.properties?.width && item.properties?.height 
          ? `${item.properties.width}x${item.properties.height}` 
          : undefined,
        age: item.age,
      };
    });
    
    return JSON.stringify({
      count,
      total,
      query: imageResult.query?.original || "unknown",
      ...(imageResult.query?.altered && { altered_query: imageResult.query.altered }),
      results: formattedResults,
    });
  }

  // For web_search_news results, format cleanly
  if (result.name === "web_search_news" && result.result && typeof result.result === "object") {
    const newsResult = result.result as {
      results?: Array<{
        title: string;
        url: string;
        description: string;
        age?: string;
        meta_url?: { hostname: string; path: string };
        thumbnail?: { src: string; width?: number; height?: number };
        breaking?: boolean;
      }>;
      total?: number;
      count?: number;
      query?: { original: string; altered?: string };
      cached?: boolean;
    };
    
    const results = newsResult.results || [];
    const total = newsResult.total || 0;
    const count = newsResult.count || results.length;
    
    if (results.length === 0) {
      return JSON.stringify({
        count: 0,
        total: 0,
        message: "No news articles found",
        query: newsResult.query?.original || "unknown",
      });
    }
    
    const formattedResults = results.map((item, index) => {
      // Enhance thumbnail URL for better quality
      const enhancedThumbnail = item.thumbnail?.src 
        ? enhanceImageUrl(item.thumbnail.src) 
        : undefined;
      
      return {
        index: index + 1,
        title: item.title || "Untitled Article",
        url: item.url,
        description: item.description?.substring(0, 200) || "",
        source: item.meta_url?.hostname,
        published: item.age,
        breaking: item.breaking || false,
        thumbnail: enhancedThumbnail || item.thumbnail?.src,
      };
    });
    
    return JSON.stringify({
      count,
      total,
      query: newsResult.query?.original || "unknown",
      ...(newsResult.query?.altered && { altered_query: newsResult.query.altered }),
      results: formattedResults,
    });
  }
  
  // For cmd_execute results, format more clearly with better structure
  if (result.name === "cmd_execute" && result.result && typeof result.result === "object") {
    const cmdResult = result.result as { stdout?: string; stderr?: string; exitCode?: number; command?: string };
    const output = cmdResult.stdout || "";
    const stderr = cmdResult.stderr || "";
    const exitCode = cmdResult.exitCode ?? -1;

    if (exitCode === 0) {
      // Success case with clean output
      if (!output.trim()) {
        return `### ✅ Command Executed Successfully\n\n**Exit Code:** 0\n\nNo output.`;
      }

      // Check if output looks like structured data (system info, etc.)
      const hasMultipleLines = output.includes("\n");
      const looksLikeKeyValue = /^[A-Za-z][A-Za-z0-9\s_-]+:\s*.+$/m.test(output);

      if (looksLikeKeyValue && hasMultipleLines) {
        // Parse output into sections with headers and key-value pairs
        const lines = output.trim().split("\n");
        const sections: Array<{ header?: string; pairs: Array<{ key: string; value: string }> }> = [];
        let currentSection: { header?: string; pairs: Array<{ key: string; value: string }> } = { pairs: [] };

        for (const line of lines) {
          const trimmed = line.trim();

          // Skip empty lines and intro text
          if (!trimmed || trimmed.startsWith("The following")) continue;

          // Check if this is a key-value pair
          const kvMatch = trimmed.match(/^([^:]+):\s*(.+)$/);

          if (kvMatch) {
            // It's a key-value pair
            currentSection.pairs.push({
              key: kvMatch[1].trim(),
              value: kvMatch[2].trim()
            });
          } else if (trimmed.length > 0 && !trimmed.includes(":")) {
            // It's likely a section header (no colon, not empty)
            // Save the previous section if it has pairs
            if (currentSection.pairs.length > 0) {
              sections.push(currentSection);
            }
            // Start a new section
            currentSection = { header: trimmed, pairs: [] };
          }
        }

        // Don't forget the last section
        if (currentSection.pairs.length > 0) {
          sections.push(currentSection);
        }

        // Format output with sections
        if (sections.length > 0) {
          let result = `### ✅ Command Output\n\n`;

          for (const section of sections) {
            // Add section header if present
            if (section.header) {
              result += `#### ${section.header}\n\n`;
            }

            // Create table for this section
            if (section.pairs.length > 0) {
              const tableHeader = "| Property | Value |";
              const tableSeparator = "|----------|-------|";
              const tableRows = section.pairs.map(kv =>
                `| **${kv.key}** | \`${kv.value}\` |`
              );
              result += `${tableHeader}\n${tableSeparator}\n${tableRows.join("\n")}\n\n`;
            }
          }

          return result.trim();
        }

        // Fallback: single table if no sections detected
        const kvPairs: Array<{ key: string; value: string }> = [];
        for (const line of lines) {
          const match = line.match(/^([^:]+):\s*(.+)$/);
          if (match) {
            kvPairs.push({ key: match[1].trim(), value: match[2].trim() });
          }
        }

        if (kvPairs.length > 0) {
          const tableHeader = "| Property | Value |";
          const tableSeparator = "|----------|-------|";
          const tableRows = kvPairs.map(kv => `| **${kv.key}** | \`${kv.value}\` |`);
          return `### ✅ Command Output\n\n${tableHeader}\n${tableSeparator}\n${tableRows.join("\n")}`;
        }
      }

      // Default: show as code block
      const hasWarnings = stderr && !stderr.trim().startsWith("W:");
      let result = `### ✅ Command Output\n\n**Exit Code:** 0\n\n\`\`\`\n${output.trim()}\n\`\`\``;

      if (hasWarnings) {
        result += `\n\n**⚠️ Warnings:**\n\n\`\`\`\n${stderr.trim()}\n\`\`\``;
      }

      return result;
    } else {
      // Failure case
      let result = `### ❌ Command Failed\n\n**Exit Code:** ${exitCode}`;

      if (stderr.trim()) {
        result += `\n\n**Error:**\n\n\`\`\`\n${stderr.trim()}\n\`\`\``;
      }

      if (output.trim()) {
        result += `\n\n**Output:**\n\n\`\`\`\n${output.trim()}\n\`\`\``;
      }

      return result;
    }
  }

  // COMMENTED OUT: File system tools formatting with bold file names
  // if (result.name.startsWith("fs_") && result.result && typeof result.result === "object") {
  //   const fsResult = result.result as any;
  //   
  //   // fs_read: Show content directly, metadata inline
  //   if (result.name === "fs_read") {
  //     if (fsResult.content !== undefined) {
  //       const path = fsResult.path || "";
  //       const fileName = path.split("/").pop() || path.split("\\").pop() || path;
  //       const parts: string[] = [];
  //       if (fsResult.size !== undefined) parts.push(`Size: ${fsResult.size} bytes`);
  //       if (fsResult.type !== undefined) parts.push(`Type: ${fsResult.type}`);
  //       const metadata = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  //       return `## **${fileName}**${metadata}\n\n${fsResult.content}`;
  //     }
  //   }
  //   
  //   // fs_write: Simple success message with bold file name
  //   if (result.name === "fs_write") {
  //     const path = fsResult.path || "file";
  //     const fileName = path.split("/").pop() || path.split("\\").pop() || path;
  //     const size = fsResult.size !== undefined ? ` (${fsResult.size} bytes)` : "";
  //     return `File written successfully: **${fileName}**${size}`;
  //   }
  //   
  //   // fs_list: Compact directory listing with bold file names
  //   if (result.name === "fs_list") {
  //     const items = fsResult.items || fsResult.files || [];
  //     const dirPath = fsResult.path || "unknown";
  //     const dirName = dirPath.split("/").pop() || dirPath.split("\\").pop() || dirPath;
  //     
  //     if (items.length === 0) {
  //       return `## **${dirName}**\n\nDirectory is empty`;
  //     }
  //     const lines = items.map((item: any) => {
  //       const type = item.type === "directory" ? "📁" : "📄";
  //       const size = item.size !== undefined ? ` (${item.size} bytes)` : "";
  //       return `${type} **${item.name}**${size}`;
  //     });
  //     return `## **${dirName}**\n\n${lines.join("\n")}`;
  //   }
  //   
  //   // fs_delete: Simple success message with bold file name
  //   if (result.name === "fs_delete") {
  //     const path = fsResult.path || "file";
  //     const fileName = path.split("/").pop() || path.split("\\").pop() || path;
  //     return `Deleted: **${fileName}**`;
  //   }
  //   
  //   // Fallback: compact JSON (no pretty printing)
  //   return JSON.stringify(fsResult);
  // }
  
  // For GitHub tools, format compactly
  if (result.name.startsWith("github_") && result.result && typeof result.result === "object") {
    const ghResult = result.result as any;
    
    // github_read_file: Show content with compact header
    if (result.name === "github_read_file" && ghResult.content !== undefined) {
      const path = ghResult.path || "";
      const fileName = path.split("/").pop() || path;
      const parts: string[] = [];
      parts.push(`**${fileName}**`);
      if (ghResult.sha) parts.push(`sha:${ghResult.sha.substring(0, 7)}`);
      if (ghResult.size !== undefined) parts.push(`${ghResult.size} bytes`);
      const header = parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(", ")})` : parts[0];
      return `${header}\n\n${ghResult.content}`;
    }
    
    // github_write_file: Compact success message
    if (result.name === "github_write_file") {
      const path = ghResult.path || "file";
      const fileName = path.split("/").pop() || path;
      const sha = ghResult.sha ? ` (sha:${ghResult.sha.substring(0, 7)})` : "";
      return `✓ Written: **${fileName}**${sha}`;
    }
    
    // github_list_files: Compact listing
    if (result.name === "github_list_files" && Array.isArray(ghResult.files)) {
      const files = ghResult.files;
      const dirPath = ghResult.path || "/";
      if (files.length === 0) {
        return `**${dirPath}**\n\nEmpty directory`;
      }
      const lines = files.map((file: any) => {
        const icon = file.type === "dir" ? "📁" : "📄";
        const size = file.size !== undefined ? ` (${file.size} bytes)` : "";
        return `${icon} ${file.name}${size}`;
      });
      return `**${dirPath}**\n\n${lines.join("\n")}`;
    }
    
    // For other GitHub results, use compact JSON
    return JSON.stringify(ghResult);
  }
  
  // For fs_ tools and other object results, format compactly with better structure
  if (result.name.startsWith("fs_") && result.result && typeof result.result === "object") {
    const fsResult = result.result as any;
    
    // fs_read: Show content with clear header and metadata
    if (result.name === "fs_read" && fsResult.content !== undefined) {
      const path = fsResult.path || "";
      const fileName = path.split("/").pop() || path.split("\\").pop() || path;
      const metadata: string[] = [];

      metadata.push(`**Path:** \`${path}\``);
      if (fsResult.size !== undefined) metadata.push(`**Size:** ${fsResult.size} bytes`);
      if (fsResult.type !== undefined) metadata.push(`**Type:** ${fsResult.type}`);

      return `### 📄 ${fileName}\n\n${metadata.join("  \n")}\n\n\`\`\`\n${fsResult.content}\n\`\`\``;
    }
    
    // fs_write: Success message with clear structure
    if (result.name === "fs_write") {
      const path = fsResult.path || "file";
      const fileName = path.split("/").pop() || path.split("\\").pop() || path;
      const action = fsResult.created ? "Created" : "Updated";
      const metadata: string[] = [];

      metadata.push(`**Path:** \`${path}\``);
      if (fsResult.size !== undefined) metadata.push(`**Size:** ${fsResult.size} bytes`);
      if (fsResult.lines !== undefined) metadata.push(`**Lines:** ${fsResult.lines}`);

      return `### ✅ File ${action}\n\n**File:** \`${fileName}\`  \n${metadata.join("  \n")}`;
    }
    
    // fs_list: Table-based directory listing with clear headers
    if (result.name === "fs_list") {
      const items = fsResult.items || fsResult.files || [];
      const dirPath = fsResult.path || "unknown";
      const totalItems = items.length;

      if (items.length === 0) {
        return `### 📂 Directory Listing\n\n**Path:** \`${dirPath}\`  \n**Total:** 0 items\n\nDirectory is empty.`;
      }

      // Create markdown table for better structure
      const tableHeader = "| Type | Name | Size |";
      const tableSeparator = "|------|------|------|";
      const tableRows = items.map((item: any) => {
        const icon = item.type === "directory" ? "📁" : "📄";
        const size = item.size !== undefined ? `${item.size} bytes` : "—";
        const name = `\`${item.name}\``;
        return `| ${icon} | ${name} | ${size} |`;
      });

      return `### 📂 Directory Listing\n\n**Path:** \`${dirPath}\`  \n**Total:** ${totalItems} item${totalItems === 1 ? "" : "s"}\n\n${tableHeader}\n${tableSeparator}\n${tableRows.join("\n")}`;
    }
    
    // fs_delete: Success message with clear structure
    if (result.name === "fs_delete") {
      const path = fsResult.path || "file";
      const fileName = path.split("/").pop() || path.split("\\").pop() || path;
      return `### ✅ File Deleted\n\n**File:** \`${fileName}\`  \n**Path:** \`${path}\``;
    }
    
    // For other fs_ results, use compact single-line JSON
    return JSON.stringify(fsResult);
  }
  
  // For any other object results, use compact JSON (single line)
  if (typeof result.result === "object" && result.result !== null) {
    return JSON.stringify(result.result);
  }
  
  // Default: return as-is for strings/primitive values
  return String(result.result);
}

/**
 * Generate a unique ID for a tool call.
 */
export function generateToolCallId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

