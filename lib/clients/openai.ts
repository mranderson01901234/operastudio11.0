import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ToolDefinition } from "./gemini";

export type OpenAIMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type OpenAIStreamChunk =
  | { type: "text"; text: string }
  | { type: "error"; error: Error }
  | { type: "metadata"; data: Record<string, unknown> }
  | { type: "function_call"; functionCall: { name: string; args: Record<string, unknown> } };

const MODEL = "gpt-5-nano";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set.");
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return cachedClient;
}

function formatMessagesForOpenAI(messages: OpenAIMessage[]): ChatCompletionMessageParam[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

function formatToolsForOpenAI(tools?: ToolDefinition[]) {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: tool.parameters.type,
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    },
  }));
}

export async function* streamChat({
  messages,
  signal,
  tools,
  model,
}: {
  messages: OpenAIMessage[];
  signal?: AbortSignal;
  tools?: ToolDefinition[];
  model?: string; // Optional, not used by OpenAI client but kept for type compatibility
}): AsyncGenerator<OpenAIStreamChunk> {
  const client = getClient();
  const formattedMessages = formatMessagesForOpenAI(messages);
  const formattedTools = formatToolsForOpenAI(tools);

  try {
    const stream = await client.chat.completions.create({
      model: MODEL,
      messages: formattedMessages,
      tools: formattedTools,
      stream: true,
      ...(signal ? { signal } : {}),
    });

    // Accumulate function call data as OpenAI streams it incrementally
    const functionCallAccumulators: Map<number, { name?: string; arguments: string }> = new Map();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      // Handle function calls - OpenAI streams them incrementally
      if (choice.delta.tool_calls) {
        for (const toolCall of choice.delta.tool_calls) {
          if (toolCall.function) {
            const index = toolCall.index ?? 0;
            const accumulator = functionCallAccumulators.get(index) || { arguments: "" };
            
            if (toolCall.function.name) {
              accumulator.name = toolCall.function.name;
            }
            if (toolCall.function.arguments) {
              accumulator.arguments += toolCall.function.arguments;
            }
            
            functionCallAccumulators.set(index, accumulator);
          }
        }
      }

      // When finish_reason is "tool_calls" or stream ends, yield accumulated function calls
      if (choice.finish_reason === "tool_calls" || (choice.finish_reason && functionCallAccumulators.size > 0)) {
        for (const [index, accumulator] of functionCallAccumulators.entries()) {
          if (accumulator.name && accumulator.arguments) {
            try {
              const args = JSON.parse(accumulator.arguments);
              yield {
                type: "function_call",
                functionCall: {
                  name: accumulator.name,
                  args,
                },
              };
            } catch (error) {
              // If JSON parsing fails, try to yield with raw arguments string
              // This might happen if arguments are incomplete
              if (accumulator.arguments.trim().length > 0) {
                yield {
                  type: "function_call",
                  functionCall: {
                    name: accumulator.name,
                    args: { raw: accumulator.arguments },
                  },
                };
              }
            }
          }
        }
        functionCallAccumulators.clear();
      }

      // Handle text content
      const content = choice.delta.content;
      if (content) {
        yield { type: "text", text: content };
      }

      // Handle finish reason (metadata) - but not for tool_calls (handled above)
      if (choice.finish_reason && choice.finish_reason !== "tool_calls") {
        yield {
          type: "metadata",
          data: {
            finish_reason: choice.finish_reason,
            usage: chunk.usage,
          },
        };
      }
    }

    // Yield any remaining accumulated function calls at the end of the stream
    if (functionCallAccumulators.size > 0) {
      for (const [index, accumulator] of functionCallAccumulators.entries()) {
        if (accumulator.name && accumulator.arguments) {
          try {
            const args = JSON.parse(accumulator.arguments);
            yield {
              type: "function_call",
              functionCall: {
                name: accumulator.name,
                args,
              },
            };
          } catch (error) {
            // If JSON parsing fails, yield with raw arguments if available
            if (accumulator.arguments.trim().length > 0) {
              yield {
                type: "function_call",
                functionCall: {
                  name: accumulator.name,
                  args: { raw: accumulator.arguments },
                },
              };
            }
          }
        }
      }
      functionCallAccumulators.clear();
    }
  } catch (error) {
    if (error instanceof Error) {
      yield { type: "error", error };
      throw error;
    }

    const err = new Error("Unknown OpenAI streaming error");
    yield { type: "error", error: err };
    throw err;
  }
}

if (process.env.OPENAI_API_KEY) {
  void getClient();
}

