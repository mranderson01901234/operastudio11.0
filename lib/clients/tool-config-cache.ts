/**
 * Tool Configuration Cache
 * Caches tool declarations to avoid reprocessing on every request
 * Significantly improves Time To First Token (TTFT) performance
 */

import type { ToolDefinition } from "@/lib/chat/tool-definitions";

type CachedToolConfig = {
  functionDeclarations: any[];
  timestamp: number;
};

// Cache with TTL (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;
const toolConfigCache = new Map<string, CachedToolConfig>();

/**
 * Get cached tool configuration or build and cache it
 */
export function getCachedToolConfig(tools: ToolDefinition[] | undefined | null): any[] | null {
  if (!tools || tools.length === 0) {
    return null;
  }

  // Create cache key from tool names (sorted for consistency)
  const cacheKey = tools
    .map((t) => t.name)
    .sort()
    .join(",");

  const cached = toolConfigCache.get(cacheKey);
  const now = Date.now();

  // Check if cache is valid
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.functionDeclarations;
  }

  // Build tool declarations
  const functionDeclarations = tools.map((tool) => {
    // Handle special pipeline tool with complex nested schema
    if (tool.name === "ops_run_pipeline" && (tool as any).fullSchema) {
      return {
        name: tool.name,
        description: tool.description,
        parameters: (tool as any).fullSchema,
      };
    }

    // Standard tool definition conversion
    const declaration: any = {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: tool.parameters.type,
        properties: Object.fromEntries(
          Object.entries(tool.parameters.properties).map(([key, value]: [string, any]) => {
            const property: any = {
              type: value.type,
              description: value.description,
            };

            // For array types, include items field
            if (value.type === "array") {
              if ((value as any).items) {
                const itemsDef = (value as any).items;
                if (typeof itemsDef === "object" && itemsDef.type) {
                  property.items = {
                    type: itemsDef.type,
                    ...(itemsDef.properties ? { properties: itemsDef.properties } : {}),
                    ...(itemsDef.required ? { required: itemsDef.required } : {}),
                    ...(itemsDef.enum ? { enum: itemsDef.enum } : {}),
                  };
                } else {
                  property.items = { type: itemsDef };
                }
              }
            }

            // Handle object types with nested properties
            if (value.type === "object" && (value as any).properties) {
              property.properties = (value as any).properties;
              if ((value as any).required) {
                property.required = (value as any).required;
              }
              if ((value as any).additionalProperties !== undefined) {
                property.additionalProperties = (value as any).additionalProperties;
              }
            }

            // Handle enum types
            if ((value as any).enum) {
              property.enum = (value as any).enum;
            }

            return [key, property];
          })
        ),
        required: tool.parameters.required,
      },
    };
    return declaration;
  });

  // Cache the result
  toolConfigCache.set(cacheKey, {
    functionDeclarations,
    timestamp: now,
  });

  return functionDeclarations;
}

/**
 * Clear expired cache entries
 */
export function cleanupToolConfigCache(): void {
  const now = Date.now();
  for (const [key, value] of toolConfigCache.entries()) {
    if (now - value.timestamp >= CACHE_TTL_MS) {
      toolConfigCache.delete(key);
    }
  }
}

/**
 * Clear all cached tool configurations (for testing/debugging)
 */
export function clearToolConfigCache(): void {
  toolConfigCache.clear();
}

