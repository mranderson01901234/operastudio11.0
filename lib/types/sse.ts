/**
 * Server-Sent Events (SSE) types for tool-run events
 */

export type ToolRunEventType = "tool.start" | "tool.chunk" | "tool.complete" | "tool.error" | "tool.cancel";

export interface ToolStartEvent {
  type: "tool.start";
  sessionId: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolChunkEvent {
  type: "tool.chunk";
  sessionId: string;
  data: string;
}

export interface ToolCompleteEvent {
  type: "tool.complete";
  sessionId: string;
  result: Record<string, unknown>;
}

export interface ToolErrorEvent {
  type: "tool.error";
  sessionId: string;
  error: string;
  message: string;
}

export interface ToolCancelEvent {
  type: "tool.cancel";
  sessionId: string;
}

export type ToolRunEvent = ToolStartEvent | ToolChunkEvent | ToolCompleteEvent | ToolErrorEvent | ToolCancelEvent;

