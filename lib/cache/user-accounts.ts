/**
 * User Account Status Cache
 * Caches user account status (email, GitHub, MCP sessions) to reduce database queries
 * and improve Time To First Token (TTFT) performance.
 */

import { prisma } from "@/lib/prisma";
import { hasActiveSession } from "@/lib/mcp/session-router";
import { Redis } from "@upstash/redis";

type UserAccountStatus = {
  hasEmailAccount: boolean;
  hasGitHubAccount: boolean;
  hasMCPSession: boolean;
  hasImageEditingSession: boolean;
};

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
let redisClient: Redis | null = null;

// Initialize Redis client if available
try {
  if (process.env.REDIS_URL) {
    redisClient = new Redis({
      url: process.env.REDIS_URL,
      token: process.env.REDIS_TOKEN,
    });
    console.info("[UserAccountCache] Redis client initialized");
  }
} catch (error) {
  console.warn("[UserAccountCache] Failed to initialize Redis, using in-memory cache:", error);
}

// In-memory fallback cache
const memoryCache = new Map<string, { data: UserAccountStatus; expiresAt: number }>();

function getCacheKey(userId: string): string {
  return `user:${userId}:accounts`;
}

function cleanupMemoryCache(): void {
  const now = Date.now();
  for (const [key, value] of memoryCache.entries()) {
    if (value.expiresAt < now) {
      memoryCache.delete(key);
    }
  }
}

async function getFromCache(userId: string): Promise<UserAccountStatus | null> {
  const cacheKey = getCacheKey(userId);

  // Try Redis first
  if (redisClient) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached as string);
      }
    } catch (error) {
      console.warn("[UserAccountCache] Redis get error, falling back to memory:", error);
    }
  }

  // Fall back to memory cache
  cleanupMemoryCache();
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  return null;
}

async function setCache(userId: string, data: UserAccountStatus): Promise<void> {
  const cacheKey = getCacheKey(userId);
  const expiresAt = Date.now() + CACHE_TTL_SECONDS * 1000;

  // Try Redis first
  if (redisClient) {
    try {
      await redisClient.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(data));
      return;
    } catch (error) {
      console.warn("[UserAccountCache] Redis set error, falling back to memory:", error);
    }
  }

  // Fall back to memory cache
  memoryCache.set(cacheKey, { data, expiresAt });
}

/**
 * Get user account status with caching
 * This function queries the database and caches the result for 5 minutes
 * to reduce database load and improve TTFT performance.
 */
export async function getUserAccountStatus(userId: string): Promise<UserAccountStatus> {
  // Try cache first
  const cached = await getFromCache(userId);
  if (cached) {
    return cached;
  }

  // Query database in parallel
  const [emailAccount, githubAccount, hasImageEditingSession, hasMCPSession] =
    await Promise.all([
      prisma.emailAccount
        .findFirst({
          where: {
            userId,
            status: "ACTIVE",
          },
        })
        .catch(() => null),
      prisma.gitHubAccount
        .findFirst({
          where: {
            userId,
            status: "ACTIVE",
          },
        })
        .catch(() => null),
      hasActiveSession(userId, "image-editing"),
      hasActiveSession(userId, "filesystem"),
    ]);

  const result: UserAccountStatus = {
    hasEmailAccount: !!emailAccount,
    hasGitHubAccount: !!githubAccount,
    hasMCPSession,
    hasImageEditingSession,
  };

  // Cache result (non-blocking)
  setCache(userId, result).catch((error) => {
    console.warn("[UserAccountCache] Failed to cache result:", error);
  });

  return result;
}

/**
 * Invalidate cache for a user
 * Call this when user account status changes (e.g., connects/disconnects GitHub)
 */
export async function invalidateUserAccountCache(userId: string): Promise<void> {
  const cacheKey = getCacheKey(userId);

  // Clear Redis cache
  if (redisClient) {
    try {
      await redisClient.del(cacheKey);
    } catch (error) {
      console.warn("[UserAccountCache] Redis delete error:", error);
    }
  }

  // Clear memory cache
  memoryCache.delete(cacheKey);
}

/**
 * Clear all cached account statuses (for testing/debugging)
 */
export function clearAllCaches(): void {
  memoryCache.clear();
}

