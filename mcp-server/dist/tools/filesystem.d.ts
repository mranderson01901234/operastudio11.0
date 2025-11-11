import type { SecurityPolicy } from "../security.js";
/**
 * File system tools for MCP server
 */
export declare class FileSystemTools {
    private security;
    constructor(security: SecurityPolicy);
    /**
     * Read file contents
     */
    read(filePath: string, maxBytes?: number): Promise<{
        content: string;
        size: number;
        type: string;
    }>;
    /**
     * Write file contents
     */
    write(filePath: string, content: string, create?: boolean): Promise<{
        success: boolean;
        path: string;
        created: boolean;
        size: number;
        lines: number;
    }>;
    /**
     * List directory contents
     */
    list(dirPath: string, depth?: number, includeHidden?: boolean): Promise<{
        items: Array<{
            path: string;
            type: "file" | "directory";
            size: number;
            mtime: string;
        }>;
    }>;
    /**
     * Delete a file or directory
     */
    delete(filePath: string, recursive?: boolean): Promise<{
        success: boolean;
        path: string;
        deleted: boolean;
        type: "file" | "directory";
    }>;
}
//# sourceMappingURL=filesystem.d.ts.map