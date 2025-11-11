import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { streamChatMock, hasProviderMock } = vi.hoisted(() => {
  return {
    streamChatMock: vi.fn(async function* () {
      yield { type: "text", text: "hello" };
      yield { type: "done" };
    }),
    hasProviderMock: vi.fn(() => true),
  };
});

vi.mock("@/lib/chat/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat/session")>(
    "@/lib/chat/session"
  );

  return {
    ...actual,
    streamChat: streamChatMock,
    hasProvider: hasProviderMock,
  };
});

import { POST } from "@/app/api/chat/route";

type MockRequest = Pick<NextRequest, "json" | "signal">;

function createRequest(body: unknown): MockRequest {
  const controller = new AbortController();
  return {
    json: async () => body,
    signal: controller.signal,
  } as MockRequest;
}

describe("POST /api/chat", () => {
  it("streams response chunks when provider is available", async () => {
    const response = await POST(
      createRequest({
        provider: "gemini-flash",
        messages: [{ role: "user", content: "Hello" }],
      }) as unknown as NextRequest
    );

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    const { value } = await reader!.read();
    const chunk = decoder.decode(value);

    expect(chunk).toContain('"type":"text"');
    expect(streamChatMock).toHaveBeenCalled();
  });

  it("returns 400 when provider is unsupported", async () => {
    hasProviderMock.mockReturnValueOnce(false);

    const response = await POST(
      createRequest({
        provider: "unknown",
        messages: [{ role: "user", content: "Hello" }],
      }) as unknown as NextRequest
    );

    expect(response.status).toBe(400);
  });
});
