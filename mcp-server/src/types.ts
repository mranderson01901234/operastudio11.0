/**
 * Security modes for MCP server
 */
export type SecurityMode = "SAFE" | "BALANCED" | "UNRESTRICTED";

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  mode: SecurityMode;
  port: number;
  durationMinutes?: number; // For UNRESTRICTED mode
  allowedPaths?: string[]; // Whitelist of allowed paths
  deniedPaths?: string[]; // Blacklist of denied paths
}

/**
 * Tool execution result
 */
export interface ToolResult {
  content?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

