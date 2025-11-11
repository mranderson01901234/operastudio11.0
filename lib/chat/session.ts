import { GeminiMessage, GeminiStreamChunk, streamChat as streamGeminiChat, ToolDefinition } from "@/lib/clients/gemini";
import { OpenAIMessage, OpenAIStreamChunk, streamChat as streamOpenAIChat } from "@/lib/clients/openai";

export type ChatMessage = GeminiMessage | OpenAIMessage;

export type ChatStreamChunk =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "metadata"; data: Record<string, unknown> }
  | { type: "error"; message: string; cause?: unknown }
  | { type: "function_call"; functionCall: { name: string; args: Record<string, unknown> } };

type ChatConnector = {
  streamChat: (options: {
    messages: ChatMessage[];
    signal?: AbortSignal;
    tools?: ToolDefinition[];
    model?: string;
  }) => AsyncGenerator<GeminiStreamChunk | OpenAIStreamChunk>;
  model?: string; // Model to use for this provider
};

const connectors: Record<string, ChatConnector> = {
  "gemini-flash": {
    streamChat: streamGeminiChat,
    model: "gemini-flash-latest", // Default model for gemini-flash
  },
  "gemini-2.5-flash": {
    streamChat: streamGeminiChat,
    model: "gemini-2.5-flash",
  },
  "gemini-2.5-flash-lite": {
    streamChat: streamGeminiChat,
    model: "gemini-2.5-flash-lite",
  },
  "gpt-5-nano": {
    streamChat: streamOpenAIChat,
  },
};

export function listProviders() {
  return Object.keys(connectors);
}

export function hasProvider(providerId: string) {
  return providerId in connectors;
}

export async function* streamChat({
  providerId,
  messages,
  signal,
  tools,
}: {
  providerId: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  tools?: ToolDefinition[];
}): AsyncGenerator<ChatStreamChunk> {
  const connector = connectors[providerId];

  if (!connector) {
    throw new Error(`Unknown provider "${providerId}".`);
  }

  // Use provider-specific model if available, otherwise let the connector use its default
  const model = connector.model;

  for await (const chunk of connector.streamChat({ messages, signal, tools, model })) {
    if (chunk.type === "text") {
      yield chunk;
    } else if (chunk.type === "metadata") {
      yield chunk;
    } else if (chunk.type === "error") {
      yield {
        type: "error",
        message: chunk.error.message,
        cause: chunk.error,
      };
    } else if (chunk.type === "function_call") {
      yield {
        type: "function_call",
        functionCall: chunk.functionCall,
      };
    }
  }
}

