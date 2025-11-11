import * as fs from "fs/promises";
import * as path from "path";
/**
 * File system tools for MCP server
 */
export class FileSystemTools {
    security;
    constructor(security) {
        this.security = security;
    }
    /**
     * Read file contents
     */
    async read(filePath, maxBytes = 10 * 1024 * 1024) {
        // Check security
        const pathCheck = this.security.isPathAllowed(filePath);
        if (!pathCheck.allowed) {
            throw new Error(`PERMISSION_DENIED: ${pathCheck.reason}`);
        }
        // Check if file exists
        try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
                throw new Error(`NOT_FOUND: Path is not a file: ${filePath}`);
            }
            // Read file
            const content = await fs.readFile(filePath, "utf-8");
            const size = Buffer.byteLength(content, "utf-8");
            // Truncate if too large
            if (size > maxBytes) {
                const truncated = content.substring(0, maxBytes);
                return {
                    content: truncated + `\n\n... (truncated, ${size} bytes total)`,
                    size,
                    type: "text",
                };
            }
            return {
                content,
                size,
                type: "text",
            };
        }
        catch (error) {
            if (error.code === "ENOENT") {
                throw new Error(`NOT_FOUND: File not found: ${filePath}`);
            }
            throw error;
        }
    }
    /**
     * Write file contents
     */
    async write(filePath, content, create = true) {
        // Check security
        const writeCheck = this.security.isWriteAllowed(filePath);
        if (!writeCheck.allowed) {
            throw new Error(`PERMISSION_DENIED: ${writeCheck.reason}`);
        }
        // Check if file already exists
        let fileExisted = false;
        try {
            await fs.access(filePath);
            fileExisted = true;
        }
        catch {
            fileExisted = false;
        }
        // Check if parent directory exists
        const dir = path.dirname(filePath);
        try {
            await fs.access(dir);
        }
        catch {
            if (create) {
                await fs.mkdir(dir, { recursive: true });
            }
            else {
                throw new Error(`NOT_FOUND: Parent directory does not exist: ${dir}`);
            }
        }
        // Write file
        await fs.writeFile(filePath, content, "utf-8");
        const size = Buffer.byteLength(content, "utf-8");
        const lines = content.split("\n").length;
        return {
            success: true,
            path: filePath,
            created: !fileExisted,
            size,
            lines,
        };
    }
    /**
     * List directory contents
     */
    async list(dirPath, depth = 1, includeHidden = false) {
        // Check security
        const pathCheck = this.security.isPathAllowed(dirPath);
        if (!pathCheck.allowed) {
            throw new Error(`PERMISSION_DENIED: ${pathCheck.reason}`);
        }
        // Check if directory exists
        try {
            const stats = await fs.stat(dirPath);
            if (!stats.isDirectory()) {
                throw new Error(`NOT_FOUND: Path is not a directory: ${dirPath}`);
            }
        }
        catch (error) {
            if (error.code === "ENOENT") {
                throw new Error(`NOT_FOUND: Directory not found: ${dirPath}`);
            }
            throw error;
        }
        const items = [];
        async function scanDir(currentPath, currentDepth) {
            if (currentDepth > depth) {
                return;
            }
            const entries = await fs.readdir(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                // Skip hidden files if not requested
                if (!includeHidden && entry.name.startsWith(".")) {
                    continue;
                }
                const fullPath = path.join(currentPath, entry.name);
                const stats = await fs.stat(fullPath);
                items.push({
                    path: fullPath,
                    type: entry.isDirectory() ? "directory" : "file",
                    size: stats.size,
                    mtime: stats.mtime.toISOString(),
                });
                // Recurse into directories
                if (entry.isDirectory() && currentDepth < depth) {
                    await scanDir(fullPath, currentDepth + 1);
                }
            }
        }
        await scanDir(dirPath, 0);
        return { items };
    }
    /**
     * Delete a file or directory
     */
    async delete(filePath, recursive = false) {
        // Check security - deletion requires write permission
        const writeCheck = this.security.isWriteAllowed(filePath);
        if (!writeCheck.allowed) {
            throw new Error(`PERMISSION_DENIED: ${writeCheck.reason}`);
        }
        // Check if path exists and get its type
        let pathType;
        try {
            const stats = await fs.stat(filePath);
            pathType = stats.isDirectory() ? "directory" : "file";
        }
        catch (error) {
            if (error.code === "ENOENT") {
                throw new Error(`NOT_FOUND: Path not found: ${filePath}`);
            }
            throw error;
        }
        // Delete the file or directory
        try {
            if (pathType === "directory") {
                if (recursive) {
                    await fs.rm(filePath, { recursive: true, force: true });
                }
                else {
                    await fs.rmdir(filePath);
                }
            }
            else {
                await fs.unlink(filePath);
            }
            return {
                success: true,
                path: filePath,
                deleted: true,
                type: pathType,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            throw new Error(`DELETE_FAILED: ${errorMessage}`);
        }
    }
}
//# sourceMappingURL=filesystem.js.map