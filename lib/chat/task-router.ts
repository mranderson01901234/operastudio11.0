/**
 * Task Router - Determines whether to use local model or Gemini API
 */

export type TaskType = "local" | "gemini" | "hybrid";

export interface TaskAnalysis {
  type: TaskType;
  confidence: number;
  reason: string;
}

/**
 * Simple tasks that can be handled by local model
 */
const LOCAL_MODEL_TASKS = [
  // System information gathering
  "gather system information",
  "get system info",
  "system details",
  "system information",
  "system status",
  
  // File operations
  "summarize file",
  "file summary",
  "extract metadata",
  "file title",
  "generate title",
  
  // Command output parsing
  "parse command output",
  "parse output",
  "format command result",
  "command result",
  
  // Text processing
  "extract key information",
  "key points",
  "summarize text",
  "brief summary",
  "short description",
  
  // Simple queries
  "what is",
  "explain briefly",
  "quick answer",
  "simple question",
];

/**
 * Complex tasks that require Gemini
 */
const GEMINI_TASKS = [
  "write code",
  "generate code",
  "create function",
  "implement",
  "debug",
  "fix error",
  "complex reasoning",
  "multi-step",
  "analyze",
  "compare",
  "explain in detail",
  "detailed explanation",
];

/**
 * Analyze a user message to determine which model to use
 */
export function analyzeTask(userMessage: string, context?: {
  hasToolCalls?: boolean;
  previousMessages?: number;
  isFollowUp?: boolean;
}): TaskAnalysis {
  const messageLower = userMessage.toLowerCase().trim();
  
  // If it's a follow-up after tool calls, prefer local model for simple formatting
  if (context?.isFollowUp && !context.hasToolCalls) {
    // Check if it's asking for simple formatting/summarization
    const simpleFollowUpPatterns = [
      "format",
      "summarize",
      "brief",
      "short",
      "quick",
    ];
    
    if (simpleFollowUpPatterns.some(pattern => messageLower.includes(pattern))) {
      return {
        type: "local",
        confidence: 0.7,
        reason: "Follow-up request for simple formatting/summarization",
      };
    }
  }
  
  // Check for complex tasks first (higher priority)
  const hasComplexTask = GEMINI_TASKS.some(task => 
    messageLower.includes(task)
  );
  
  if (hasComplexTask) {
    return {
      type: "gemini",
      confidence: 0.9,
      reason: "Complex task detected (code generation, debugging, analysis)",
    };
  }
  
  // Check for simple tasks
  const hasSimpleTask = LOCAL_MODEL_TASKS.some(task => 
    messageLower.includes(task)
  );
  
  if (hasSimpleTask) {
    const matchedTask = LOCAL_MODEL_TASKS.find(task => messageLower.includes(task));
    return {
      type: "local",
      confidence: 0.8,
      reason: `Simple task detected: "${matchedTask}" (system info, file summary, text processing)`,
    };
  }
  
  // Default to Gemini for unknown tasks
  return {
    type: "gemini",
    confidence: 0.5,
    reason: "Unknown task type, defaulting to Gemini",
  };
}

/**
 * Check if a task should use local model
 */
/**
 * Check if task should use local model (client-side check)
 * Note: Actual model readiness is checked server-side
 */
export function shouldUseLocalModel(
  userMessage: string,
  context?: {
    hasToolCalls?: boolean;
    previousMessages?: number;
    isFollowUp?: boolean;
  }
): boolean {
  const analysis = analyzeTask(userMessage, context);
  // Only return true if task type matches - actual readiness checked server-side
  return analysis.type === "local" && analysis.confidence >= 0.6;
}

/**
 * Check if model is ready (server-side only)
 * This is called from the API route to verify model availability
 */
export async function isLocalModelReady(): Promise<boolean> {
  try {
    const { isModelReady } = await import("@/lib/clients/smollm");
    return await isModelReady();
  } catch {
    return false;
  }
}

/**
 * Get task-specific prompt for local model
 */
export function getLocalModelPrompt(
  userMessage: string,
  taskType: string,
  context?: Record<string, unknown>
): string {
  const basePrompt = userMessage;
  
  // Add context-specific instructions
  if (taskType === "system_info") {
    return `You are a system information assistant. Format the following system information into a concise, structured summary. Focus on key details only.

${basePrompt}

Provide a brief, well-formatted summary.`;
  }
  
  if (taskType === "file_summary") {
    return `You are a file analysis assistant. Provide a brief summary of the following file content. Extract key information and create a short title.

${basePrompt}

Provide a concise summary and a short title (max 10 words).`;
  }
  
  if (taskType === "command_output") {
    return `You are a command output parser. Format and summarize the following command output into structured, readable information.

${basePrompt}

Provide a formatted, structured summary.`;
  }
  
  return basePrompt;
}

