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
    durationMinutes?: number;
    allowedPaths?: string[];
    deniedPaths?: string[];
}
/**
 * Tool execution result
 */
export interface ToolResult {
    content?: string;
    error?: string;
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=types.d.ts.map