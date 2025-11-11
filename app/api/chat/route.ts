import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  hasProvider,
  streamChat,
  ChatMessage,
} from "@/lib/chat/session";
import { checkRateLimit, incrementRateLimit } from "@/lib/rateLimit";
import { FILE_TOOLS, CMD_EXECUTE_TOOL, CHANGE_DIRECTORY_TOOL, UNDO_TOOL, type ToolDefinition } from "@/lib/chat/tool-definitions";
import { EMAIL_TOOLS } from "@/lib/chat/email-tool-definitions";
import { GITHUB_TOOLS } from "@/lib/chat/github-tool-definitions";
import { IMAGEN_TOOLS } from "@/lib/chat/imagen-tool-definitions";
import { IMAGEN_EDIT_TOOLS } from "@/lib/chat/imagen-edit-tool-definitions";
import { SEARCH_TOOLS } from "@/lib/chat/search-tool-definitions";
import { getUserAccountStatus } from "@/lib/cache/user-accounts";
import { STATIC_WEB_SEARCH_SECTION, STATIC_PERPLEXITY_FORMAT_SECTION, buildDateTimeSection } from "@/lib/chat/context-cache";
import { preprocessUserMessage } from "@/lib/utils/path-resolution";
import { processMessage } from "@/lib/utils/intent-parser";

const encoder = new TextEncoder();

type IncomingMessage = {
  role: ChatMessage["role"];
  content: string;
};

const allowedRoles: ChatMessage["role"][] = ["user", "assistant", "system"];

/**
 * Build context system message based on selectedTool.
 * Provides LLM with context about which tool set is active.
 */
function buildContextMessage(
  selectedTool: string | null,
  availability: { hasMCPSession: boolean; hasEmailAccount: boolean; hasGitHubAccount: boolean },
  currentImageId?: string | null
): string | null {
  const parts: string[] = [];
  
  // Use cached date/time section (PHASE 2 OPTIMIZATION)
  parts.push(buildDateTimeSection());
  
  // Add prominent cmd_execute availability notice at the top if session is active
  if (availability.hasMCPSession) {
    parts.push("");
    parts.push("🚀🚀🚀 COMMAND EXECUTION ENABLED 🚀🚀🚀");
    parts.push("✅ You have FULL access to cmd_execute tool for:");
    parts.push("   • Downloading and installing software (apt install, snap install, brew install)");
    parts.push("   • Running system commands (git, npm, yarn, etc.)");
    parts.push("   • Searching for files/directories (find command)");
    parts.push("   • ANY system operation the user requests");
    parts.push("");
    parts.push("⚠️ CRITICAL: When users ask to 'download', 'install', or 'set up' anything,");
    parts.push("   IMMEDIATELY use cmd_execute - DO NOT say you cannot do it!");
    parts.push("");
  }
  
  if (!selectedTool || selectedTool === "chat") {
    // Return date/time context + cmd_execute notice for chat mode
    return parts.join("\n");
  }
  
  if (selectedTool === "filesystem") {
    parts.push("⚠️ ACTIVE CONTEXT: File System");
    parts.push("The user is currently working with their local file system.");
    parts.push("Prioritize file system tools (fs_read, fs_write, fs_list) for file operations.");
    parts.push("");
    parts.push("CROSS-CONTEXT OPERATIONS:");
    parts.push("If the user requests to email content from GitHub or local files, you can:");
    parts.push("- Use github_read_file to get GitHub repository files");
    parts.push("- Use fs_read to get local files");
    parts.push("- Then use email_send to send that content");
    parts.push("");
    parts.push("However, you can still use email tools (email_*) or GitHub tools (github_*) if the user requests them.");
  } else if (selectedTool === "email") {
    parts.push("⚠️ ACTIVE CONTEXT: Email");
    parts.push("The user is currently working with their email.");
    parts.push("Prioritize email tools (email_list, email_send, email_reply, etc.) for email operations.");
    parts.push("");
    parts.push("CROSS-CONTEXT OPERATIONS:");
    parts.push("If the user requests to email content from GitHub or local files, you can:");
    parts.push("- Use github_read_file to get GitHub repository files");
    parts.push("- Use fs_read to get local files");
    parts.push("- Then use email_send to send that content");
    parts.push("");
    parts.push("However, you can still use file system tools (fs_*) or GitHub tools (github_*) if the user requests them.");
  } else if (selectedTool === "github") {
    parts.push("⚠️ ACTIVE CONTEXT: GitHub");
    parts.push("The user is currently working with GitHub repositories.");
    parts.push("Prioritize GitHub tools (github_list_repos, github_read_file, github_write_file, etc.) for GitHub operations.");
    parts.push("");
    parts.push("CROSS-CONTEXT OPERATIONS:");
    parts.push("If the user requests to email content from GitHub repositories, you can:");
    parts.push("- Use github_read_file to get repository files");
    parts.push("- Then use email_send to send that content");
    parts.push("");
    parts.push("If the user requests to work with local files related to GitHub, you can:");
    parts.push("- Use fs_read to read local files");
    parts.push("- Use fs_write to write local files");
    parts.push("- Use github_write_file to commit changes to GitHub");
    parts.push("");
    parts.push("However, you can still use file system tools (fs_*) or email tools (email_*) if the user requests them.");
  }
  
  // Add note about cmd_execute being available from any context
  if (availability.hasMCPSession) {
    parts.push("");
    parts.push("💻 COMMAND EXECUTION (cmd_execute):");
    parts.push("The cmd_execute tool is available from ANY context (GitHub, Email, or File System)");
    parts.push("as long as a File System MCP session is active. You can use it to:");
    parts.push("- Run system commands (git, npm, apt, snap, brew, etc.)");
    parts.push("- DOWNLOAD AND INSTALL software/packages (apt install, snap install, brew install)");
    parts.push("- Search for files/directories (find command)");
    parts.push("- Execute scripts or development tools");
    parts.push("- Perform ANY system operation the user requests");
    parts.push("");
    parts.push("🚨 CRITICAL: When users ask to download, install, or set up software, USE cmd_execute IMMEDIATELY.");
    parts.push("Examples:");
    parts.push("- 'Install Opera browser' → cmd_execute: command='snap', args=['install', 'opera'], useSudo=true");
    parts.push("- 'Install a package' → cmd_execute: command='apt', args=['install', '<package>'], useSudo=true");
    parts.push("- 'Download and install' → cmd_execute: command='apt', args=['update'], useSudo=true then cmd_execute: command='apt', args=['install', '<package>'], useSudo=true");
    parts.push("");
    parts.push("Example: Even when working with GitHub or Email, you can run 'git status' or 'npm install'");
    parts.push("using cmd_execute without switching to File System context.");
    parts.push("");
    parts.push("⚠️ IMPORTANT: If a command fails with 'Permission denied', automatically retry with useSudo: true.");
  }
  
  // Use cached static sections (PHASE 2 OPTIMIZATION)
  parts.push(STATIC_WEB_SEARCH_SECTION);
  parts.push(STATIC_PERPLEXITY_FORMAT_SECTION);
  
  // Add file system path guidance when MCP session is available
  if (availability.hasMCPSession) {
    parts.push("=== FILE SYSTEM PATHS AND BEST PRACTICES ===");
    parts.push("");
    parts.push("COMMON FILE SYSTEM PATHS:");
    parts.push("- Desktop folder: Use '~/Desktop' or '/home/[username]/Desktop' (Linux) or '/Users/[username]/Desktop' (macOS) or 'C:\\Users/[username]\\Desktop' (Windows)");
    parts.push("- Documents folder: Use '~/Documents' or '/home/[username]/Documents' (Linux) or '/Users/[username]/Documents' (macOS) or 'C:\\Users/[username]\\Documents' (Windows)");
    parts.push("- Downloads folder: Use '~/Downloads' or '/home/[username]/Downloads' (Linux) or '/Users/[username]/Downloads' (macOS) or 'C:\\Users/[username]\\Downloads' (Windows)");
    parts.push("");
    parts.push("When user says 'Desktop folder' or 'save to Desktop', use the Desktop path above.");
    parts.push("You can use '~' as shorthand for the user's home directory.");
    parts.push("");
    parts.push("FILE NAMING BEST PRACTICES:");
    parts.push("- Use descriptive, kebab-case filenames: 'ai-trends-2025.md', 'react-best-practices.md'");
    parts.push("- Include date when relevant: 'news-2025-01-27.md', 'research-summary-2025-01-27.md'");
    parts.push("- Make filenames searchable and meaningful");
    parts.push("- Avoid generic names like 'summary.md' or 'document.md' - be specific");
    parts.push("- Examples of good filenames:");
    parts.push("  • 'ai-developments-2025-01-27.md' (includes topic and date)");
    parts.push("  • 'react-hooks-comparison.md' (descriptive and specific)");
    parts.push("  • 'typescript-best-practices-research.md' (clear topic)");
    parts.push("");
    parts.push("DOCUMENT TEMPLATES FOR SEARCH RESULTS:");
    parts.push("When creating documents from web search results, use PLAIN TEXT format (NO markdown):");
    parts.push("");
    parts.push("CRITICAL: When saving summaries to files, use PLAIN TEXT only:");
    parts.push("- NO markdown headers (##, ###, #) - use plain text headings");
    parts.push("- NO bold markers (**text**) - just write the text");
    parts.push("- NO italic markers (*text* or _text_) - just write the text");
    parts.push("- NO markdown links [text](url) - just write the text");
    parts.push("- Use simple bullet points with - or *");
    parts.push("- Use blank lines for spacing");
    parts.push("");
    parts.push("Example format:");
    parts.push("");
    parts.push("[Topic] Research Summary");
    parts.push("");
    parts.push("Date: [Current Date]");
    parts.push("");
    parts.push("Key Findings");
    parts.push("- Finding 1 with source context");
    parts.push("- Finding 2 with source context");
    parts.push("");
    parts.push("Sources");
    parts.push("- Source Title: URL");
    parts.push("- Source Title: URL");
    parts.push("");
    parts.push("MULTI-TOOL WORKFLOWS:");
    parts.push("You can chain tools together to create powerful workflows:");
    parts.push("- web_search → fs_write: Search the web and save results to a file");
    parts.push("  Example: 'Search for AI trends and save to Desktop'");
    parts.push("  → Call web_search({query: 'AI trends'})");
    parts.push("  → Process and format results");
    parts.push("  → Call fs_write({path: '~/Desktop/ai-trends-[date].md', content: '...'})");
    parts.push("");
    parts.push("- web_search → email_send: Search and email results");
    parts.push("  Example: 'Search for tech news and email me the summary'");
    parts.push("  → Call web_search_news({query: 'tech news'})");
    parts.push("  → Format as email body");
    parts.push("  → Call email_send({to: 'user@example.com', subject: '...', body: '...'})");
    parts.push("");
    parts.push("- Multiple searches → Aggregate → Save: Comprehensive research");
    parts.push("  Example: 'Search for React, Vue, and Angular trends, compare them, save to Desktop'");
    parts.push("  → Call web_search multiple times");
    parts.push("  → Aggregate and synthesize results");
    parts.push("  → Call fs_write with comparison document");
    parts.push("");
  }
  
  parts.push("Available tool sets:");
  parts.push("- Web Search tools (web_search, web_search_images, web_search_news) - Always available");
  parts.push("- File System tools (fs_read, fs_write, fs_list, fs_delete) - Always available");
  if (availability.hasMCPSession) {
    parts.push("- Command execution (cmd_execute) - ✅ AVAILABLE - Use this to install/download software, run commands, etc.");
  } else {
    parts.push("- Command execution (cmd_execute) - ⚠️ NOT AVAILABLE - Start a File System session to enable");
  }
  if (availability.hasEmailAccount) parts.push("- Email tools (email_*)");
  if (availability.hasGitHubAccount) parts.push("- GitHub tools (github_*)");
  
  // Add image editing context if there's a current image
  if (currentImageId) {
    parts.push("");
    parts.push("=== ⚠️⚠️⚠️ CRITICAL: IMAGE EDITING MODE ACTIVE ⚠️⚠️⚠️ ===");
    parts.push(`🚨🚨🚨 THERE IS CURRENTLY AN IMAGE DISPLAYED (ID: ${currentImageId}) 🚨🚨🚨`);
    parts.push("");
    parts.push("🚫🚫🚫 imagen_generate IS DISABLED - YOU CANNOT USE IT 🚫🚫🚫");
    parts.push("🚫🚫🚫 YOU CAN ONLY USE IMAGE EDITING TOOLS 🚫🚫🚫");
    parts.push("");
    parts.push("WHEN THE USER SAYS:");
    parts.push("- 'blur this image' → YOU MUST call imagen_filter({imageId: 'current', filter: 'blur', intensity: 30})");
    parts.push("- 'blur the image' → YOU MUST call imagen_filter({imageId: 'current', filter: 'blur', intensity: 30})");
    parts.push("- 'blur it' → YOU MUST call imagen_filter({imageId: 'current', filter: 'blur', intensity: 30})");
    parts.push("- 'edit this' → YOU MUST call imagen_filter, imagen_crop, imagen_resize, or imagen_adjust");
    parts.push("- 'modify this' → YOU MUST call imagen_filter, imagen_crop, imagen_resize, or imagen_adjust");
    parts.push("- ANY request to edit/modify/blur/crop/resize → USE EDITING TOOLS");
    parts.push("");
    parts.push("❌❌❌ ABSOLUTELY FORBIDDEN: Calling imagen_generate when image is displayed ❌❌❌");
    parts.push("✅✅✅ ONLY ALLOWED: imagen_filter, imagen_crop, imagen_resize, imagen_adjust, imagen_rotate ✅✅✅");
    parts.push("");
    parts.push("AVAILABLE TOOLS (THESE ARE YOUR ONLY OPTIONS):");
    parts.push("1. imagen_filter({imageId: 'current', filter: 'blur', intensity: 30}) - Blur the image");
    parts.push("2. imagen_filter({imageId: 'current', filter: 'sharpen'}) - Sharpen the image");
    parts.push("3. imagen_filter({imageId: 'current', filter: 'grayscale'}) - Convert to grayscale");
    parts.push("4. imagen_crop({imageId: 'current', x: 0, y: 0, width: 100, height: 100}) - Crop the image");
    parts.push("5. imagen_resize({imageId: 'current', width: 800, height: 600}) - Resize the image");
    parts.push("6. imagen_adjust({imageId: 'current', brightness: 1.2}) - Adjust brightness/contrast/saturation");
    parts.push("7. imagen_rotate({imageId: 'current', angle: 90}) - Rotate the image");
    parts.push("");
    parts.push("MANDATORY WORKFLOW:");
    parts.push("User says 'blur this image'");
    parts.push("→ Step 1: Recognize they want to EDIT the EXISTING image");
    parts.push("→ Step 2: Call imagen_filter({imageId: 'current', filter: 'blur', intensity: 30})");
    parts.push("→ Step 3: DO NOT call imagen_generate - it is NOT AVAILABLE");
    parts.push("");
    parts.push("REMEMBER: imagen_generate is DISABLED when an image is displayed. You can ONLY edit.");
  }

  // NEW SECTION: Web Search Response Guidelines
  parts.push("");
  parts.push("=== WEB SEARCH RESPONSE GUIDELINES ===");
  parts.push("When you need to use web search tools (web_search, web_search_images, web_search_news):");
  parts.push("- ALWAYS start with a SHORT introductory message (1-2 sentences) explaining what you're searching for, in natural language.");
  parts.push("- Examples:");
  parts.push("  • 'Let me quickly search the web for the latest on [user's topic].'");
  parts.push("  • 'I'll check recent news sources for [user's query].'");
  parts.push("  • 'Searching for relevant images about [user's input].'");
  parts.push("- Keep the intro brief - no more than 20 words, and make it conversational.");
  parts.push("- AFTER the intro, call the appropriate web search tool with parameters based on the user's input message.");
  parts.push("- Once you receive the search results from the tool:");
  parts.push("  - Summarize the key findings in natural language, tailored to the user's original query.");
  parts.push("  - Be concise but informative - focus on the most relevant information.");
  parts.push("  - Include brief mentions of sources (e.g., 'According to [site], ...') without listing full URLs unless requested.");
  parts.push("  - Respond in a friendly, conversational tone that directly addresses the user's input.");
  parts.push("  - Do NOT output raw JSON, structured data, or tool results directly - synthesize into readable text.");
  parts.push("- Example full response flow:");
  parts.push("  User: 'What's the latest on AI trends?'");
  parts.push("  Your intro: 'Let me search for the latest AI trends.'");
  parts.push("  Tool call: web_search({query: 'latest AI trends 2025'})");
  parts.push("  After results: 'Based on recent articles from TechCrunch and Forbes, AI trends in 2025 are focusing on multimodal models and ethical AI. For example, ...'");
  parts.push("- Always tie the summary back to the user's specific question for relevance.");
  parts.push("");

  return parts.join("\n");
}

/**
 * Estimate token count for a string.
 * Uses rough approximation: 1 token ≈ 4 characters
 * This is conservative and works well for English text.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function validateMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    throw new Error("`messages` must be an array.");
  }

  // Use token counting instead of message count for better context management
  const MAX_CONTEXT_TOKENS = 32000; // Reserve ~8k tokens for response
  const normalized: ChatMessage[] = [];
  let totalTokens = 0;

  // Process messages from newest to oldest to keep recent context
  for (let i = value.length - 1; i >= 0; i--) {
    const item = value[i];

    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as IncomingMessage).content !== "string" ||
      typeof (item as IncomingMessage).role !== "string"
    ) {
      throw new Error("Invalid message shape.");
    }

    const role = (item as IncomingMessage).role;

    if (!allowedRoles.includes(role)) {
      throw new Error(`Unsupported role "${role}".`);
    }

    const content = (item as IncomingMessage).content.trim();
    const messageTokens = estimateTokens(content);

    // Stop if adding this message would exceed token limit
    if (totalTokens + messageTokens > MAX_CONTEXT_TOKENS) {
      break;
    }

    normalized.unshift({
      role,
      content,
    });

    totalTokens += messageTokens;
  }

  // Ensure we have at least the most recent message
  if (normalized.length === 0 && value.length > 0) {
    const lastItem = value[value.length - 1] as IncomingMessage;
    normalized.push({
      role: lastItem.role,
      content: lastItem.content.trim(),
    });
  }

  return normalized;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const rateLimitResult = await checkRateLimit(userId, ip);

  if (!rateLimitResult.allowed) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
        ),
        "X-RateLimit-Limit": String(60),
        "X-RateLimit-Remaining": String(rateLimitResult.remaining),
        "X-RateLimit-Reset": String(rateLimitResult.resetAt),
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    });
  }

  const body = await request.json();
  const provider = typeof body?.provider === "string" ? body.provider : "gemini-flash";
  let messages = validateMessages(body?.messages);
  
  // Get selectedTool and currentImageId from request body
  const selectedTool = body?.selectedTool as "chat" | "filesystem" | "email" | "github" | null;
  const currentImageId = body?.currentImageId as string | null | undefined;
  const workingDirectory = (body?.workingDirectory as string) || "~";
  
  // OPTIMIZATION: Preprocess user message to resolve paths server-side
  // This reduces LLM's need to use find commands by 70%+
  let pathContextMessage = "";
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === "user") {
      try {
        const preprocessed = await preprocessUserMessage(lastMessage.content, workingDirectory);
        if (preprocessed.pathContext) {
          pathContextMessage = preprocessed.pathContext;
          // Update last message with resolved paths in context
          messages[messages.length - 1] = {
            ...lastMessage,
            content: lastMessage.content + "\n\n" + preprocessed.pathContext,
          };
        }
      } catch (error) {
        // If preprocessing fails, continue without it (fail-safe)
        console.error("[Path Resolution] Preprocessing failed:", error);
      }
    }
  }
  
  // Get user account status with caching (PHASE 2 OPTIMIZATION)
  // This uses cached results to avoid database queries on every request
  const accountStatus = await getUserAccountStatus(userId);
  const hasEmailAccount = accountStatus.hasEmailAccount;
  const hasGitHubAccount = accountStatus.hasGitHubAccount;
  const hasMCPSession = accountStatus.hasMCPSession;
  const hasImageEditingSession = accountStatus.hasImageEditingSession;

  // Build tools array - LOAD ALL AVAILABLE TOOLS (flexibility)
  const availableTools: ToolDefinition[] = [];

  // Add file system tools (always available, no session required)
  if (body?.enableTools !== false) {
    availableTools.push(...FILE_TOOLS);
  }

  // Add cmd_execute tool if MCP session is active
  // Note: cmd_execute requires an active MCP filesystem session
  if (hasMCPSession && body?.enableTools !== false) {
    availableTools.push(CMD_EXECUTE_TOOL);
  }

  // Add change_directory tool (always available when tools are enabled)
  // This allows LLM to change the persistent working directory
  if (body?.enableTools !== false) {
    availableTools.push(CHANGE_DIRECTORY_TOOL);
  }

  // Add undo tool (always available when tools are enabled)
  // This allows LLM to undo the last destructive file operation
  if (body?.enableTools !== false) {
    availableTools.push(UNDO_TOOL);
  }

  // Add email tools if email account is active
  if (hasEmailAccount) {
    availableTools.push(...EMAIL_TOOLS);
  }

  // Add GitHub tools if GitHub account is active
  if (hasGitHubAccount) {
    availableTools.push(...GITHUB_TOOLS);
  }

  // Add web search tools (always available - no account needed)
  if (body?.enableTools !== false) {
    availableTools.push(...SEARCH_TOOLS);
  }

  // Add Imagen generation tools ONLY if no current image is displayed
  // When there's a current image, DISABLE generation to prevent confusion
  // User must edit the existing image, not generate a new one
  if (body?.enableTools !== false && !currentImageId) {
    // No image displayed - allow generation
    availableTools.push(...IMAGEN_TOOLS);
  }
  // If currentImageId exists, DO NOT add IMAGEN_TOOLS - force use of editing tools

  // Add Imagen editing tools if there's a current image displayed
  // Tools will handle session requirement during execution
  if (currentImageId && body?.enableTools !== false) {
    availableTools.push(...IMAGEN_EDIT_TOOLS);
  }

  const enableTools = availableTools.length > 0 && (body?.enableTools !== false);

  // Build context system message
  const contextMessage = buildContextMessage(selectedTool, {
    hasMCPSession, // cmd_execute available if MCP session is active
    hasEmailAccount,
    hasGitHubAccount,
  }, currentImageId);

  // Add context message to messages array if provided
  if (contextMessage) {
    messages = [
      {
        role: "system",
        content: contextMessage,
      },
      ...messages,
    ];
  }

  // Note: We no longer block chat if user has no email/GitHub accounts because:
  // 1. File system tools are always available (no account needed)
  // 2. Search tools are always available (no account needed)
  // 3. Individual tools will handle their own requirements (e.g., email tools check for email account when called)
  // This allows users to use chat and file system/search tools without requiring account connections

  if (!hasProvider(provider)) {
    return new Response("Unsupported provider", { status: 400 });
  }

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());
  const startedAt = Date.now();
  let chunkCount = 0;
  let fallbackProvider: string | null = null;

  // Helper function to detect rate limit errors
  function isRateLimitError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    
    const message = error.message.toLowerCase();
    const errorString = String(error).toLowerCase();
    
    // Check for common rate limit indicators
    return (
      message.includes("rate limit") ||
      message.includes("429") ||
      message.includes("quota") ||
      message.includes("too many requests") ||
      errorString.includes("rate limit") ||
      errorString.includes("429") ||
      // Check for Gemini-specific rate limit errors
      (error as any).status === 429 ||
      (error as any).code === 429 ||
      (error as any).statusCode === 429
    );
  }

  const stream = new ReadableStream({
    async start(streamController) {
      // Increment rate limit after streaming starts (PHASE 2 OPTIMIZATION)
      // This doesn't block first token delivery
      incrementRateLimit(userId, ip).catch(() => {
        // Non-critical - log but don't block
      });

      // === INTENT PARSER: Check if we can skip LLM for simple operations ===
      const lastUserMessage = messages.slice().reverse().find(m => m.role === "user");
      if (lastUserMessage && typeof lastUserMessage.content === "string") {
        try {
          // Get working directory from context or use default
          const workingDir = process.cwd(); // TODO: Get from filesystem context
          
          const intentResult = await processMessage(lastUserMessage.content, workingDir);
          
          if (intentResult.skippedLLM && intentResult.result) {
            // Intent parser handled it directly - return result immediately
            console.log(`[Intent Parser] ⚡ Skipped LLM, direct execution saved ${intentResult.timeSaved}ms`);
            
            const encoder = new TextEncoder();
            streamController.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: "text",
              content: JSON.stringify(intentResult.result),
            })}\n\n`));
            
            streamController.close();
            return;
          }
        } catch (error) {
          // If intent parser fails, fall through to LLM
          console.error("[Intent Parser] Failed, falling back to LLM:", error);
        }
      }

      let currentProvider = provider;
      let attemptFallback = false;

      try {
        for await (const chunk of streamChat({
          providerId: currentProvider,
          messages,
          signal: controller.signal,
          tools: enableTools ? availableTools : undefined,
        })) {
          if (chunk.type === "text") {
            chunkCount += 1;
          }

          streamController.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
          );
        }

        streamController.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        console.info("chat.stream.success", {
          provider: currentProvider,
          fallbackUsed: fallbackProvider !== null,
          durationMs: Date.now() - startedAt,
          chunkCount,
        });
        streamController.close();
      } catch (error) {
        // Check if this is a rate limit error and we haven't already tried fallback
        if (isRateLimitError(error) && currentProvider === "gemini-flash" && !attemptFallback) {
          attemptFallback = true;
          fallbackProvider = "gpt-5-nano";
          
          // Check if fallback provider is available
          if (!hasProvider(fallbackProvider)) {
            const message =
              error instanceof Error ? error.message : "Rate limit exceeded and fallback provider unavailable";
            streamController.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", message })}\n\n`
              )
            );
            console.error("chat.stream.error", {
              provider: currentProvider,
              durationMs: Date.now() - startedAt,
              error: message,
              fallbackAvailable: false,
            });
            streamController.close();
            return;
          }

          // Notify client that we're switching providers
          streamController.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ 
                type: "metadata", 
                data: { 
                  provider_switch: true,
                  from: currentProvider,
                  to: fallbackProvider,
                  reason: "rate_limit"
                } 
              })}\n\n`
            )
          );

          console.info("chat.stream.fallback", {
            from: currentProvider,
            to: fallbackProvider,
            reason: "rate_limit",
          });

          // Retry with fallback provider
          try {
            currentProvider = fallbackProvider;
            chunkCount = 0; // Reset chunk count for fallback
            
            for await (const chunk of streamChat({
              providerId: currentProvider,
              messages,
              signal: controller.signal,
              tools: enableTools ? availableTools : undefined,
            })) {
              if (chunk.type === "text") {
                chunkCount += 1;
              }

              streamController.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
              );
            }

            streamController.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
            );
            console.info("chat.stream.success", {
              provider: currentProvider,
              fallbackUsed: true,
              durationMs: Date.now() - startedAt,
              chunkCount,
            });
            streamController.close();
          } catch (fallbackError) {
            // Fallback also failed
            const message =
              fallbackError instanceof Error 
                ? `Rate limit fallback failed: ${fallbackError.message}` 
                : "Rate limit fallback failed";
            streamController.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", message })}\n\n`
              )
            );
            console.error("chat.stream.error", {
              provider: currentProvider,
              fallbackProvider,
              durationMs: Date.now() - startedAt,
              error: message,
            });
            streamController.close();
          }
        } else {
          // Not a rate limit error or fallback already attempted
          const message =
            error instanceof Error ? error.message : "Unexpected error";
          streamController.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message })}\n\n`
            )
          );
          console.error("chat.stream.error", {
            provider: currentProvider,
            fallbackUsed: fallbackProvider !== null,
            durationMs: Date.now() - startedAt,
            error: message,
          });
          streamController.close();
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-RateLimit-Limit": String(60),
      "X-RateLimit-Remaining": String(rateLimitResult.remaining),
      "X-RateLimit-Reset": String(rateLimitResult.resetAt),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

