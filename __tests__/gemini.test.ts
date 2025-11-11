import { describe, expect, it } from "vitest";

import { formatMessagesForGemini } from "@/lib/clients/gemini";
import { hasProvider, listProviders } from "@/lib/chat/session";

describe("formatMessagesForGemini", () => {
  it("splits history and latest user message while merging system prompts", () => {
    const result = formatMessagesForGemini([
      { role: "system", content: "System message" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "How are you?" },
    ]);

    expect(result).toEqual({
      history: [
        { role: "user", parts: [{ text: "System message\n\nHello" }] },
        { role: "model", parts: [{ text: "Hi" }] },
      ],
      latestUserText: "How are you?",
    });
  });

  it("returns null latestUserText when the final message is not a user turn", () => {
    const result = formatMessagesForGemini([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);

    expect(result).toEqual({
      history: [
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "model", parts: [{ text: "Hi there" }] },
      ],
      latestUserText: null,
    });
  });

  it("ignores leading assistant messages before the first user turn", () => {
    const result = formatMessagesForGemini([
      { role: "assistant", content: "Welcome!" },
      { role: "user", content: "Hi" },
    ]);

    expect(result).toEqual({
      history: [],
      latestUserText: "Hi",
    });
  });
});

describe("chat session provider registry", () => {
  it("exposes gemini-flash provider", () => {
    expect(listProviders()).toContain("gemini-flash");
    expect(hasProvider("gemini-flash")).toBe(true);
  });
});
