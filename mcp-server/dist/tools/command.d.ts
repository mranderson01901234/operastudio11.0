import type { SecurityPolicy } from "../security.js";
/**
 * Command execution tools for MCP server
 */
export declare class CommandTools {
    private security;
    constructor(security: SecurityPolicy);
    /**
     * Execute shell command
     */
    execute(command: string, args?: string[], cwd?: string, timeout?: number, // 5 minutes for installations
    useSudo?: boolean, sudoPassword?: string): Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
        needsSudo?: boolean;
    }>;
}
//# sourceMappingURL=command.d.ts.map