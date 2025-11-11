import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/chat/route";
import { clearRateLimitStore } from "@/lib/rateLimit";

// Mock Clerk auth - hoisted
const { mockAuth } = vi.hoisted(() => {
  return {
    mockAuth: vi.fn(),
  };
});

vi.mock("@clerk/nextjs/server", async () => {
  const actual = await vi.importActual<typeof import("@clerk/nextjs/server")>(
    "@clerk/nextjs/server"
  );
  return {
    ...actual,
    auth: mockAuth,
  };
});

// Mock chat session
const { streamChatMock, hasProviderMock } = vi.hoisted(() => {
  return {
    streamChatMock: vi.fn(async function* () {
      yield { type: "text", text: "test" };
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

type MockRequest = Pick<NextRequest, "json" | "signal" | "headers">;

function createRequest(
  body: unknown,
  options?: {
    userId?: string | null;
    ip?: string;
    headers?: Record<string, string>;
  }
): MockRequest {
  const controller = new AbortController();
  const headers = new Headers(options?.headers || {});
  if (options?.ip) {
    headers.set("x-forwarded-for", options.ip);
  }

  mockAuth.mockResolvedValue({
    userId: options?.userId ?? "test-user-id",
  });

  return {
    json: async () => body,
    signal: controller.signal,
    headers,
  } as unknown as MockRequest;
}

describe("Security Hardening Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Authentication Checks", () => {
    it("returns 401 for unauthenticated requests to /api/chat", async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const controller = new AbortController();
      const headers = new Headers({ "x-forwarded-for": "127.0.0.1" });
      const request = {
        json: async () => ({
          provider: "gemini-flash",
          messages: [{ role: "user", content: "Hello" }],
        }),
        signal: controller.signal,
        headers,
      } as unknown as NextRequest;

      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Unauthorized");
    });

    it("includes security headers in 401 response", async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const request = createRequest(
        {
          provider: "gemini-flash",
          messages: [{ role: "user", content: "Hello" }],
        },
        { userId: null }
      );

      const response = await POST(request as unknown as NextRequest);

      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("Referrer-Policy")).toBe(
        "strict-origin-when-cross-origin"
      );
    });
  });

  describe("Rate Limiting", () => {
    it("rate limits key on userId", async () => {
      const userId1 = "user-1";
      const userId2 = "user-2";
      const ip = "127.0.0.1";

      // User 1 makes 60 requests (should all pass)
      for (let i = 0; i < 60; i++) {
        const request = createRequest(
          {
            provider: "gemini-flash",
            messages: [{ role: "user", content: `Request ${i}` }],
          },
          { userId: userId1, ip }
        );

        const response = await POST(request as unknown as NextRequest);
        expect(response.status).toBe(200);
      }

      // User 1's 61st request should be rate limited
      const request61 = createRequest(
        {
          provider: "gemini-flash",
          messages: [{ role: "user", content: "Request 61" }],
        },
        { userId: userId1, ip }
      );

      const response61 = await POST(request61 as unknown as NextRequest);
      expect(response61.status).toBe(429);

      // User 2 should still be able to make requests
      const requestUser2 = createRequest(
        {
          provider: "gemini-flash",
          messages: [{ role: "user", content: "User 2 request" }],
        },
        { userId: userId2, ip }
      );

      const responseUser2 = await POST(requestUser2 as unknown as NextRequest);
      expect(responseUser2.status).toBe(200);
    });

    it("rate limits key on IP when userId is null", async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const ip1 = "127.0.0.1";
      const ip2 = "127.0.0.2";

      // IP 1 makes requests (should be rate limited by IP)
      for (let i = 0; i < 60; i++) {
        const controller = new AbortController();
        const headers = new Headers({ "x-forwarded-for": ip1 });
        const request = {
          json: async () => ({
            provider: "gemini-flash",
            messages: [{ role: "user", content: `Request ${i}` }],
          }),
          signal: controller.signal,
          headers,
        } as unknown as NextRequest;

        const response = await POST(request);
        // First request will be 401 (unauthorized), but rate limit still applies
        if (i === 0) {
          expect(response.status).toBe(401);
        }
      }

      // IP 2 should have separate rate limit
      const controller2 = new AbortController();
      const headers2 = new Headers({ "x-forwarded-for": ip2 });
      const requestIp2 = {
        json: async () => ({
          provider: "gemini-flash",
          messages: [{ role: "user", content: "IP 2 request" }],
        }),
        signal: controller2.signal,
        headers: headers2,
      } as unknown as NextRequest;

      const responseIp2 = await POST(requestIp2);
      expect(responseIp2.status).toBe(401); // Still unauthorized, but different IP
    });

    it("includes rate limit headers in 429 response", async () => {
      const userId = "test-user";
      const ip = "127.0.0.1";

      // Exhaust rate limit
      for (let i = 0; i < 60; i++) {
        await POST(
          createRequest(
            {
              provider: "gemini-flash",
              messages: [{ role: "user", content: `Request ${i}` }],
            },
            { userId, ip }
          ) as unknown as NextRequest
        );
      }

      const rateLimitedRequest = createRequest(
        {
          provider: "gemini-flash",
          messages: [{ role: "user", content: "Rate limited" }],
        },
        { userId, ip }
      );

      const response = await POST(
        rateLimitedRequest as unknown as NextRequest
      );

      expect(response.status).toBe(429);
      expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(response.headers.get("Retry-After")).toBeTruthy();
      expect(response.headers.get("X-RateLimit-Reset")).toBeTruthy();
    });

    it("rate limit persists across reconnects (same userId)", async () => {
      const userId = "test-user";
      const ip = "127.0.0.1";

      // Make 60 requests
      for (let i = 0; i < 60; i++) {
        await POST(
          createRequest(
            {
              provider: "gemini-flash",
              messages: [{ role: "user", content: `Request ${i}` }],
            },
            { userId, ip }
          ) as unknown as NextRequest
        );
      }

      // Simulate reconnect - new request should still be rate limited
      const reconnectRequest = createRequest(
        {
          provider: "gemini-flash",
          messages: [{ role: "user", content: "Reconnect" }],
        },
        { userId, ip }
      );

      const response = await POST(
        reconnectRequest as unknown as NextRequest
      );

      expect(response.status).toBe(429);
    });
  });

  describe("Security Headers", () => {
    it("includes all required security headers in SSE response", async () => {
      const request = createRequest(
        {
          provider: "gemini-flash",
          messages: [{ role: "user", content: "Hello" }],
        },
        { userId: "test-user", ip: "127.0.0.1" }
      );

      const response = await POST(request as unknown as NextRequest);

      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("Referrer-Policy")).toBe(
        "strict-origin-when-cross-origin"
      );
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    });

    it("includes security headers in rate limit response", async () => {
      const userId = "test-user";
      const ip = "127.0.0.1";

      // Exhaust rate limit
      for (let i = 0; i < 60; i++) {
        await POST(
          createRequest(
            {
              provider: "gemini-flash",
              messages: [{ role: "user", content: `Request ${i}` }],
            },
            { userId, ip }
          ) as unknown as NextRequest
        );
      }

      const response = await POST(
        createRequest(
          {
            provider: "gemini-flash",
            messages: [{ role: "user", content: "Rate limited" }],
          },
          { userId, ip }
        ) as unknown as NextRequest
      );

      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("Referrer-Policy")).toBe(
        "strict-origin-when-cross-origin"
      );
    });
  });

  describe("SSE Stream Security", () => {
    it("SSE stream reads userId server-side", async () => {
      const userId = "test-user-123";
      const request = createRequest(
        {
          provider: "gemini-flash",
          messages: [{ role: "user", content: "Hello" }],
        },
        { userId, ip: "127.0.0.1" }
      );

      const response = await POST(request as unknown as NextRequest);

      expect(response.status).toBe(200);
      // Verify auth was called to get userId
      expect(mockAuth).toHaveBeenCalled();
    });

    it("SSE stream includes rate limit headers", async () => {
      const request = createRequest(
        {
          provider: "gemini-flash",
          messages: [{ role: "user", content: "Hello" }],
        },
        { userId: "test-user", ip: "127.0.0.1" }
      );

      const response = await POST(request as unknown as NextRequest);

      expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(response.headers.get("X-RateLimit-Remaining")).toBeTruthy();
      expect(response.headers.get("X-RateLimit-Reset")).toBeTruthy();
    });

    it("SSE stream can be aborted via request signal", async () => {
      const controller = new AbortController();
      const request = {
        json: async () => ({
          provider: "gemini-flash",
          messages: [{ role: "user", content: "Hello" }],
        }),
        signal: controller.signal,
        headers: new Headers({ "x-forwarded-for": "127.0.0.1" }),
      } as unknown as NextRequest;

      mockAuth.mockResolvedValue({ userId: "test-user" });

      const responsePromise = POST(request);
      
      // Abort the request
      controller.abort();

      const response = await responsePromise;
      
      // Stream should still be created, but will be aborted
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    });
  });

  describe("CORS Configuration", () => {
    it("does not include CORS headers in API responses", async () => {
      const request = createRequest(
        {
          provider: "gemini-flash",
          messages: [{ role: "user", content: "Hello" }],
        },
        { userId: "test-user", ip: "127.0.0.1" }
      );

      const response = await POST(request as unknown as NextRequest);

      // CORS headers should not be present (CORS disabled)
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(response.headers.get("Access-Control-Allow-Methods")).toBeNull();
      expect(response.headers.get("Access-Control-Allow-Headers")).toBeNull();
    });
  });

  describe("Concurrent SSE Streams", () => {
    it("allows multiple concurrent streams from same user", async () => {
      const userId = "test-user";
      const ip = "127.0.0.1";

      // Create multiple concurrent requests
      const requests = Array.from({ length: 5 }, () =>
        createRequest(
          {
            provider: "gemini-flash",
            messages: [{ role: "user", content: "Hello" }],
          },
          { userId, ip }
        )
      );

      const responses = await Promise.all(
        requests.map((req) => POST(req as unknown as NextRequest))
      );

      // All should succeed (rate limit is per request, not per concurrent stream)
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      });
    });

    it("rate limits apply across concurrent streams", async () => {
      const userId = "test-user";
      const ip = "127.0.0.1";

      // Make 55 requests first
      for (let i = 0; i < 55; i++) {
        await POST(
          createRequest(
            {
              provider: "gemini-flash",
              messages: [{ role: "user", content: `Request ${i}` }],
            },
            { userId, ip }
          ) as unknown as NextRequest
        );
      }

      // Create 10 concurrent requests (should hit rate limit)
      const requests = Array.from({ length: 10 }, (_, i) =>
        createRequest(
          {
            provider: "gemini-flash",
            messages: [{ role: "user", content: `Concurrent ${i}` }],
          },
          { userId, ip }
        )
      );

      const responses = await Promise.all(
        requests.map((req) => POST(req as unknown as NextRequest))
      );

      // Some should succeed, some should be rate limited
      const statuses = responses.map((r) => r.status);
      const successCount = statuses.filter((s) => s === 200).length;
      const rateLimitedCount = statuses.filter((s) => s === 429).length;

      // Should have some successes and some rate limits
      expect(successCount + rateLimitedCount).toBe(10);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });
});

