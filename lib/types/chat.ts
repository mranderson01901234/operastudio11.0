/**
 * Chat message types for multimodal support (text + images)
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: ImageAttachment[];
  toolCalls?: ToolCall[];
  status?: "pending" | "streaming" | "completed" | "error";
  metadata?: Record<string, unknown>;
}

export interface ImageAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  thumbnailUrl: string; // For display in chat (base64 data URL)
  previewUrl: string;   // For split view display (base64 data URL)
  fullUrl: string;      // API endpoint to fetch original
}

export interface ToolCall {
  id: string;
  name: string;
  status: "executing" | "completed" | "error";
  result?: unknown;
  error?: string;
}

/**
 * Multimodal content parts for LLM APIs
 */
export type MultimodalContent =
  | { type: "text"; text: string }
  | { type: "image"; imageId: string; url: string; mimeType: string };

/**
 * Message format for Gemini API (with vision support)
 */
export interface GeminiMessage {
  role: "user" | "model";
  parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  >;
}

/**
 * Message format for OpenAI API (with vision support)
 */
export interface OpenAIMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
}
