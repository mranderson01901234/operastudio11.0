/**
 * Search-specific rate limiting
 * Limits search requests per user to prevent API quota exhaustion
 */

import { Redis } from "@upstash/redis";

// Rate limit configuration
const SEARCH_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_SEARCHES_PER_HOUR = 100; // 100 searches per hour per user

// In-memory fallback for when Redis is not configured
const searchRateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Initialize Redis client if credentials are available
let redisClient: Redis | null = null;
try {
  if (process.env.REDIS_URL) {
    redisClient = new Redis({
      url: process.env.REDIS_URL,
      token: process.env.REDIS_TOKEN,
    });
    console.info("[Search RateLimit] Redis client initialized for distributed rate limiting");
  } else {
    console.info("[Search RateLimit] No Redis configured, using in-memory rate limiting");
  }
} catch (error) {
  console.warn("[Search RateLimit] Failed to initialize Redis, falling back to in-memory:", error);
}

function getKey(userId: string): string {
  return `search:ratelimit:user:${userId}`;
}

// In-memory implementation (fallback)
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of searchRateLimitStore.entries()) {
    if (entry.resetAt < now) {
      searchRateLimitStore.delete(key);
    }
  }
}

async function checkSearchRateLimitInMemory(
  key: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  cleanupExpiredEntries();

  const now = Date.now();
  const entry = searchRateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // Create new entry
    const resetAt = now + SEARCH_RATE_LIMIT_WINDOW_MS;
    searchRateLimitStore.set(key, {
      count: 1,
      resetAt,
    });
    return {
      allowed: true,
      remaining: MAX_SEARCHES_PER_HOUR - 1,
      resetAt,
    };
  }

  if (entry.count >= MAX_SEARCHES_PER_HOUR) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count += 1;
  return {
    allowed: true,
    remaining: MAX_SEARCHES_PER_HOUR - entry.count,
    resetAt: entry.resetAt,
  };
}

// Redis implementation (production)
async function checkSearchRateLimitRedis(
  key: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!redisClient) {
    throw new Error("Redis client not initialized");
  }

  const now = Date.now();

  try {
    // Use Redis INCR for atomic increment
    const current = await redisClient.incr(key);

    // If this is the first request, set expiration
    if (current === 1) {
      await redisClient.pexpire(key, SEARCH_RATE_LIMIT_WINDOW_MS);
    }

    // Get TTL to calculate resetAt
    const ttl = await redisClient.pttl(key);
    const resetAt = ttl > 0 ? now + ttl : now + SEARCH_RATE_LIMIT_WINDOW_MS;

    return {
      allowed: current <= MAX_SEARCHES_PER_HOUR,
      remaining: Math.max(0, MAX_SEARCHES_PER_HOUR - current),
      resetAt,
    };
  } catch (error) {
    console.error("[Search RateLimit] Redis error, falling back to in-memory:", error);
    // Fall back to in-memory on Redis errors
    return checkSearchRateLimitInMemory(key);
  }
}

/**
 * Check if user is allowed to perform a search
 * @param userId User ID (required for search rate limiting)
 * @returns Rate limit check result
 */
export async function checkSearchRateLimit(
  userId: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = getKey(userId);

  // Use Redis if available, otherwise fall back to in-memory
  if (redisClient) {
    return checkSearchRateLimitRedis(key);
  }

  return checkSearchRateLimitInMemory(key);
}

/**
 * Get rate limit information without incrementing
 */
export async function getSearchRateLimitInfo(
  userId: string
): Promise<{ remaining: number; resetAt: number; limit: number }> {
  const key = getKey(userId);

  if (redisClient) {
    try {
      const current = await redisClient.get<number>(key) || 0;
      const ttl = await redisClient.pttl(key);
      const resetAt = ttl > 0 ? Date.now() + ttl : Date.now() + SEARCH_RATE_LIMIT_WINDOW_MS;
      
      return {
        remaining: Math.max(0, MAX_SEARCHES_PER_HOUR - current),
        resetAt,
        limit: MAX_SEARCHES_PER_HOUR,
      };
    } catch (error) {
      console.error("[Search RateLimit] Redis get error:", error);
    }
  }

  // Fall back to in-memory
  const entry = searchRateLimitStore.get(key);
  if (entry && entry.resetAt > Date.now()) {
    return {
      remaining: Math.max(0, MAX_SEARCHES_PER_HOUR - entry.count),
      resetAt: entry.resetAt,
      limit: MAX_SEARCHES_PER_HOUR,
    };
  }

  return {
    remaining: MAX_SEARCHES_PER_HOUR,
    resetAt: Date.now() + SEARCH_RATE_LIMIT_WINDOW_MS,
    limit: MAX_SEARCHES_PER_HOUR,
  };
}

// Test helper to clear rate limit store
export function clearSearchRateLimitStore(): void {
  searchRateLimitStore.clear();
}

