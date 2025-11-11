/**
 * Search result caching layer
 * Uses Redis for distributed caching with in-memory fallback
 */

import { Redis } from "@upstash/redis";
import type { SearchApiResponse } from "./types";
import * as crypto from "crypto";

// Cache TTLs (in seconds)
const CACHE_TTL_GENERAL = 60 * 60; // 1 hour for general queries
const CACHE_TTL_TIME_SENSITIVE = 5 * 60; // 5 minutes for time-sensitive queries

// In-memory fallback cache
const memoryCache = new Map<string, { data: SearchApiResponse; expiresAt: number }>();

// Initialize Redis client if credentials are available
let redisClient: Redis | null = null;
try {
  if (process.env.REDIS_URL) {
    redisClient = new Redis({
      url: process.env.REDIS_URL,
      token: process.env.REDIS_TOKEN,
    });
    console.info("[Search Cache] Redis client initialized for distributed caching");
  } else {
    console.info("[Search Cache] No Redis configured, using in-memory caching");
  }
} catch (error) {
  console.warn("[Search Cache] Failed to initialize Redis, falling back to in-memory:", error);
}

/**
 * Generate cache key from search parameters
 */
function generateCacheKey(params: {
  q: string;
  count?: number;
  offset?: number;
  safesearch?: string;
  freshness?: string;
  country?: string;
  search_lang?: string;
}): string {
  // Normalize query (lowercase, trim)
  const normalizedQuery = (params.q || "").toLowerCase().trim();
  
  // Create hash of all parameters
  const keyData = JSON.stringify({
    q: normalizedQuery,
    count: params.count || 10,
    offset: params.offset || 0,
    safesearch: params.safesearch || "moderate",
    freshness: params.freshness || undefined,
    country: params.country || undefined,
    search_lang: params.search_lang || undefined,
  });
  
  // Use SHA-256 hash for consistent key generation
  const hash = crypto.createHash("sha256").update(keyData).digest("hex");
  return `search:${hash}`;
}

/**
 * Determine cache TTL based on query parameters
 */
function getCacheTTL(freshness?: string): number {
  // Time-sensitive queries get shorter cache
  if (freshness === "pd" || freshness === "pw") {
    return CACHE_TTL_TIME_SENSITIVE;
  }
  return CACHE_TTL_GENERAL;
}

/**
 * Get cached search results
 */
export async function getCachedResults(
  params: {
    q: string;
    count?: number;
    offset?: number;
    safesearch?: string;
    freshness?: string;
    country?: string;
    search_lang?: string;
  }
): Promise<SearchApiResponse | null> {
  const key = generateCacheKey(params);
  
  // Try Redis first
  if (redisClient) {
    try {
      const cached = await redisClient.get<SearchApiResponse>(key);
      if (cached) {
        console.log(`[Search Cache] Cache HIT (Redis): ${key.substring(0, 20)}...`);
        return cached;
      }
    } catch (error) {
      console.error("[Search Cache] Redis get error, falling back to memory:", error);
      // Fall through to memory cache
    }
  }
  
  // Fall back to memory cache
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[Search Cache] Cache HIT (Memory): ${key.substring(0, 20)}...`);
    return cached.data;
  }
  
  // Clean up expired entry
  if (cached && cached.expiresAt <= Date.now()) {
    memoryCache.delete(key);
  }
  
  console.log(`[Search Cache] Cache MISS: ${key.substring(0, 20)}...`);
  return null;
}

/**
 * Store search results in cache
 */
export async function setCachedResults(
  params: {
    q: string;
    count?: number;
    offset?: number;
    safesearch?: string;
    freshness?: string;
    country?: string;
    search_lang?: string;
  },
  results: SearchApiResponse
): Promise<void> {
  const key = generateCacheKey(params);
  const ttl = getCacheTTL(params.freshness);
  
  // Store in Redis if available
  if (redisClient) {
    try {
      await redisClient.setex(key, ttl, results);
      console.log(`[Search Cache] Cached (Redis): ${key.substring(0, 20)}... (TTL: ${ttl}s)`);
      return;
    } catch (error) {
      console.error("[Search Cache] Redis set error, falling back to memory:", error);
      // Fall through to memory cache
    }
  }
  
  // Fall back to memory cache
  const expiresAt = Date.now() + ttl * 1000;
  memoryCache.set(key, { data: results, expiresAt });
  console.log(`[Search Cache] Cached (Memory): ${key.substring(0, 20)}... (TTL: ${ttl}s)`);
  
  // Clean up old entries periodically (keep cache size reasonable)
  if (memoryCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of memoryCache.entries()) {
      if (v.expiresAt <= now) {
        memoryCache.delete(k);
      }
    }
  }
}

/**
 * Invalidate cache for a specific query pattern
 */
export async function invalidateCache(
  params: {
    q: string;
    count?: number;
    offset?: number;
    safesearch?: string;
    freshness?: string;
    country?: string;
    search_lang?: string;
  }
): Promise<void> {
  const key = generateCacheKey(params);
  
  if (redisClient) {
    try {
      await redisClient.del(key);
      console.log(`[Search Cache] Invalidated (Redis): ${key.substring(0, 20)}...`);
    } catch (error) {
      console.error("[Search Cache] Redis delete error:", error);
    }
  }
  
  memoryCache.delete(key);
  console.log(`[Search Cache] Invalidated (Memory): ${key.substring(0, 20)}...`);
}

/**
 * Clear all search cache (for testing/debugging)
 */
export async function clearCache(): Promise<void> {
  if (redisClient) {
    try {
      // Note: This would require a pattern match, which Upstash Redis doesn't support directly
      // In production, you'd use SCAN or maintain a set of keys
      console.warn("[Search Cache] Cannot clear all Redis cache without pattern matching");
    } catch (error) {
      console.error("[Search Cache] Redis clear error:", error);
    }
  }
  
  memoryCache.clear();
  console.log("[Search Cache] Cleared memory cache");
}

