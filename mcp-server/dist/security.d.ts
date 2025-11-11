import type { SecurityMode } from "./types.js";
/**
 * Security policy enforcement based on mode
 */
export declare class SecurityPolicy {
    private mode;
    private allowedPaths;
    private deniedPaths;
    private userHome;
    constructor(mode: SecurityMode, allowedPaths?: string[], deniedPaths?: string[]);
    /**
     * Get default denied paths based on OS
     */
    private getDefaultDeniedPaths;
    /**
     * Check if a path is allowed
     */
    isPathAllowed(filePath: string): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Check if command execution is allowed
     */
    isCommandAllowed(command: string): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Check if file write is allowed
     */
    isWriteAllowed(filePath: string): {
        allowed: boolean;
        reason?: string;
    };
}
//# sourceMappingURL=security.d.ts.map