import { Redis } from "@upstash/redis";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

// In-memory fallback for when Redis is not configured
const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute

// Initialize Redis client if credentials are available
let redisClient: Redis | null = null;
try {
  if (process.env.REDIS_URL) {
    redisClient = new Redis({
      url: process.env.REDIS_URL,
      token: process.env.REDIS_TOKEN,
    });
    console.info("[RateLimit] Redis client initialized for distributed rate limiting");
  } else {
    console.info("[RateLimit] No Redis configured, using in-memory rate limiting");
  }
} catch (error) {
  console.warn("[RateLimit] Failed to initialize Redis, falling back to in-memory:", error);
}

function getKey(userId: string | null, ip: string): string {
  const prefix = "ratelimit";
  return userId ? `${prefix}:user:${userId}` : `${prefix}:ip:${ip}`;
}

// In-memory implementation (fallback)
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

async function checkRateLimitInMemory(
  key: string,
  increment: boolean = false
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  cleanupExpiredEntries();

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // Create new entry
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    const count = increment ? 1 : 0;
    rateLimitStore.set(key, {
      count,
      resetAt,
    });
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_WINDOW - count,
      resetAt,
    };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment count only if requested
  if (increment) {
    entry.count += 1;
  }
  
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - (increment ? entry.count : entry.count + 1),
    resetAt: entry.resetAt,
  };
}

// Redis implementation (production)
async function checkRateLimitRedis(
  key: string,
  increment: boolean = false
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!redisClient) {
    throw new Error("Redis client not initialized");
  }

  const now = Date.now();

  try {
    // Check current count first (without incrementing)
    const current = await redisClient.get(key);
    const count = current ? parseInt(current as string, 10) : 0;

    // If incrementing, do it now
    if (increment) {
      await redisClient.incr(key);
      // If this is the first request, set expiration
      if (count === 0) {
        await redisClient.pexpire(key, RATE_LIMIT_WINDOW_MS);
      }
    }

    // Get TTL to calculate resetAt
    const ttl = await redisClient.pttl(key);
    const resetAt = ttl > 0 ? now + ttl : now + RATE_LIMIT_WINDOW_MS;

    const finalCount = increment ? count + 1 : count;

    return {
      allowed: finalCount <= MAX_REQUESTS_PER_WINDOW,
      remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - finalCount),
      resetAt,
    };
  } catch (error) {
    console.error("[RateLimit] Redis error, falling back to in-memory:", error);
    // Fall back to in-memory on Redis errors
    return checkRateLimitInMemory(key, increment);
  }
}

export async function checkRateLimit(
  userId: string | null,
  ip: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = getKey(userId, ip);

  // Use Redis if available, otherwise fall back to in-memory
  // Don't increment here - we'll increment after streaming starts
  if (redisClient) {
    return checkRateLimitRedis(key, false);
  }

  return checkRateLimitInMemory(key, false);
}

/**
 * Increment rate limit counter (non-blocking)
 * This is called after streaming starts to avoid blocking first token
 */
export async function incrementRateLimit(
  userId: string | null,
  ip: string
): Promise<void> {
  const key = getKey(userId, ip);

  // Increment in background (non-blocking)
  Promise.resolve().then(async () => {
    try {
      if (redisClient) {
        await redisClient.incr(key);
        // Set expiration if this is first increment
        const current = await redisClient.get(key);
        if (current === "1") {
          await redisClient.pexpire(key, RATE_LIMIT_WINDOW_MS);
        }
      } else {
        // In-memory increment - use the check function with increment flag
        await checkRateLimitInMemory(key, true);
      }
    } catch (error) {
      // Non-critical - log but don't throw
      console.warn("[RateLimit] Failed to increment:", error);
    }
  });
}

// Test helper to clear rate limit store
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

