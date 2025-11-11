import { GoogleGenAI } from "@google/genai";
import type {
  GenerateContentConfig,
  GenerateContentResponse,
} from "@google/genai";
import { getCachedToolConfig } from "./tool-config-cache";

type GeminiRole = "user" | "assistant" | "system";

export type GeminiMessage = {
  role: GeminiRole;
  content: string;
};

export type GeminiStreamChunk =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "error"; error: Error }
  | { type: "metadata"; data: Record<string, unknown> }
  | { type: "function_call"; functionCall: { name: string; args: Record<string, unknown> } };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];
  };
}

const DEFAULT_MODEL = "gemini-flash-latest";

const SYSTEM_INSTRUCTION_TEXT = `Be extremely concise and direct. No explanations of what you're doing or why. Just do it and report results.

RESPONSE RULES:
- Maximum 1-2 sentences per response
- No explanations of your process or reasoning
- No "I will..." or "Let me..." - just do it
- Report results directly: "Done." "Found 508 items." "File created."
- If tool execution is needed, call the tool silently and report the result
- Never explain tool calls or intermediate steps
- Never describe what you're about to do - just do it

PATH RESOLUTION:
- Server-side preprocessing may have already resolved paths - check user message for resolved paths
- When user gives directory/file name, FIRST try relative to current working directory
- If relative path fails, THEN search common locations (~/Desktop, ~/Documents, ~/Downloads, ~)
- Use absolute paths in tool calls for reliability
- If ambiguous (multiple matches), ask user: "Found multiple matches. Which one?" then list options

TEXT SEARCH (GREP):
- Use cmd_execute with 'grep' to search for text in files
- Recursive: command='grep', args=['-r', '-n', 'searchterm', '/path']
- Case-insensitive: add '-i' flag
- Show filenames only: add '-l' flag
- Filter file types: args=['-r', '--include=*.ts', 'pattern', '/path']

EXAMPLES:
- Bad: "I'll search for the directory. Let me use the find command to locate it..."
- Good: [find tool call] "Changed to /home/user/Desktop/3.0"

- Bad: "The file QUICK-START.md was not found in /home/user/Desktop/operastudio-11.0/3.0/. Searching for it now..."
- Good: [find tool call] "Opened /home/user/Desktop/3.0/QUICK-START.md"

- Bad: "I notice the directory listing shows undefined values. This suggests an error in the output format..."
- Good: [tool call] "Fixed. 508 items listed."

Keep responses under 20 words unless the user explicitly asks for details.`;

function getBaseGenerationConfig(model?: string): Partial<GenerateContentConfig> {
  const config: Partial<GenerateContentConfig> = {
    temperature: 1.35,
    thinkingConfig: {
      thinkingBudget: 0,
    },
    imageConfig: {
      imageSize: "1K",
    },
    systemInstruction: [
      {
        text: SYSTEM_INSTRUCTION_TEXT,
      },
    ],
  };

  return config;
}

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  return cachedClient;
}

type GeminiContent = { role: "user" | "model"; parts: Array<{ text: string }> };

function createRequestConfig(
  signal?: AbortSignal,
  tools?: ToolDefinition[],
  model?: string
): GenerateContentConfig {
  const baseConfig = getBaseGenerationConfig(model);
  const hasTools = tools && tools.length > 0;

  const config: GenerateContentConfig = {
    ...baseConfig,
    ...(signal ? { abortSignal: signal } : {}),
  };

  // Add tools if provided (STREAM OPTIMIZATION - uses cached tool config)
  if (hasTools && tools) {
    const functionDeclarations = getCachedToolConfig(tools);
    
    if (functionDeclarations) {
      (config as any).tools = [{
        functionDeclarations
      }];
    }
  }

  return config;
}

export function formatMessagesForGemini(messages: GeminiMessage[]) {
  const formatted: GeminiContent[] = [];
  const systemMessages: string[] = [];
  let hasEncounteredUser = false;

  for (const message of messages) {
    if (message.role === "system") {
      systemMessages.push(message.content);
      continue;
    }

    const geminiRole: "user" | "model" =
      message.role === "assistant" ? "model" : "user";

    if (!hasEncounteredUser && geminiRole === "model") {
      continue;
    }

    if (
      geminiRole === "user" &&
      systemMessages.length > 0 &&
      formatted.length === 0
    ) {
      const combinedContent = [...systemMessages, message.content].join("\n\n");
      formatted.push({
        role: "user",
        parts: [{ text: combinedContent }],
      });
      systemMessages.length = 0;
      hasEncounteredUser = true;
    } else {
      formatted.push({
        role: geminiRole,
        parts: [{ text: message.content }],
      });

      if (geminiRole === "user") {
        hasEncounteredUser = true;
      }
    }
  }

  const latest = formatted.at(-1);

  if (!latest || latest.role !== "user") {
    return {
      history: formatted,
      latestUserText: null,
    };
  }

  const history = formatted.slice(0, -1);
  const latestUserText = latest.parts
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n\n");

  return { history, latestUserText };
}

export async function* streamChat({
  messages,
  signal,
  tools,
  model,
}: {
  messages: GeminiMessage[];
  signal?: AbortSignal;
  tools?: ToolDefinition[];
  model?: string;
}): AsyncGenerator<GeminiStreamChunk> {
  const client = getClient();
  const { history, latestUserText } = formatMessagesForGemini(messages);
  const modelToUse = model || DEFAULT_MODEL;

  const shouldUseChatSession =
    typeof latestUserText === "string" && latestUserText.length > 0;

  const promptContents: GeminiContent[] = latestUserText
    ? [
        ...history,
        { role: "user", parts: [{ text: latestUserText }] },
      ]
    : [...history];

  if (!shouldUseChatSession && promptContents.length === 0) {
    throw new Error("No messages available to stream to Gemini.");
  }

  // Create config once and reuse (STREAM OPTIMIZATION - eliminates duplicate work)
  // baseConfig and streamingConfig are identical except for signal, but signal can be added to baseConfig
  const requestConfig = createRequestConfig(signal, tools, modelToUse);

  const stream = shouldUseChatSession
    ? await client.chats
        .create({
          model: modelToUse,
          history,
          config: requestConfig, // Reuse same config
        })
        .sendMessageStream({
          message: latestUserText!,
          config: requestConfig, // Reuse same config
        })
    : await client.models.generateContentStream({
        model: modelToUse,
        contents: promptContents,
        config: requestConfig, // Reuse same config
      });

  try {
    let previousText = "";
    let lastChunk: GenerateContentResponse | null = null;

    for await (const chunk of stream) {
      lastChunk = chunk;

      // Check if we have candidates and content
      if (!chunk.candidates || !chunk.candidates[0]?.content) {
        continue;
      }

      const candidate = chunk.candidates[0];
      const parts = candidate.content.parts || [];

      // Process each part in order
      for (const part of parts) {
        // Check for text content
        if ((part as any).text) {
          const text = (part as any).text;
          const delta = text.startsWith(previousText)
            ? text.slice(previousText.length)
            : text;

          if (delta) {
            yield { type: "text", text: delta };
          }

          previousText = text;
        }

        // Check for function calls
        if ((part as any).functionCall) {
          const funcCall = (part as any).functionCall;
          
          yield {
            type: "function_call",
            functionCall: {
              name: funcCall.name || "",
              args: funcCall.args || {}
            }
          };
        }
      }
    }

    if (lastChunk) {
      yield {
        type: "metadata",
        data: {
          candidates: lastChunk.candidates?.map((candidate) => ({
            content: candidate.content,
            finishReason: candidate.finishReason,
            index: candidate.index,
          })),
          promptFeedback: lastChunk.promptFeedback,
          usageMetadata: lastChunk.usageMetadata,
        },
      };
    }
  } catch (error) {
    if (error instanceof Error) {
      yield { type: "error", error };
      throw error;
    }

    const err = new Error("Unknown Gemini streaming error");
    yield { type: "error", error: err };
    throw err;
  }
}

if (process.env.GEMINI_API_KEY) {
  void getClient();
}

