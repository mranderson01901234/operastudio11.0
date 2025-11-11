#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { SecurityPolicy } from "./security.js";
import { FileSystemTools } from "./tools/filesystem.js";
import { CommandTools } from "./tools/command.js";
import { BrowserTools } from "./tools/browser.js";
import * as os from "os";
import * as path from "path";
import express from "express";
import https from "https";
import http from "http";
import * as fs from "fs";
import { randomUUID } from "crypto";
/**
 * HTTPS MCP Server for OperaStudio
 * Provides file system and command execution tools with security mode restrictions
 * Designed to connect with Claude Code for live UI updates
 */
class OperaStudioHTTPSMCPServer {
    server;
    security;
    fsTools;
    cmdTools;
    browserTools;
    mode;
    app;
    httpServer = null;
    port;
    useHttps;
    certPath;
    keyPath;
    sseClients = new Set();
    apiKey;
    constructor(mode = "SAFE", port = 3000, useHttps = false, certPath, keyPath, apiKey) {
        this.mode = mode;
        this.port = port;
        this.useHttps = useHttps;
        this.certPath = certPath;
        this.keyPath = keyPath;
        this.apiKey = apiKey;
        // In containerized environments, allow /root if it's the home directory
        const deniedPaths = os.homedir() === '/root'
            ? ["/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64", "/sys", "/proc", "/dev", "/boot"]
            : undefined;
        this.security = new SecurityPolicy(mode, undefined, deniedPaths);
        this.fsTools = new FileSystemTools(this.security);
        this.cmdTools = new CommandTools(this.security);
        const downloadPath = path.join(os.homedir(), "Downloads");
        this.browserTools = new BrowserTools(this.security, downloadPath);
        this.server = new Server({
            name: "operastudio-filesystem",
            version: "0.1.0",
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.app = express();
        this.setupHandlers();
        this.setupExpressRoutes();
    }
    setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = [
                {
                    name: "fs_read",
                    description: "Read file contents",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: {
                                type: "string",
                                description: "File path to read",
                            },
                            maxBytes: {
                                type: "number",
                                description: "Maximum bytes to read (default: 10MB)",
                            },
                        },
                        required: ["path"],
                    },
                },
                {
                    name: "fs_write",
                    description: "Write file contents",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: {
                                type: "string",
                                description: "File path to write",
                            },
                            content: {
                                type: "string",
                                description: "Content to write",
                            },
                            create: {
                                type: "boolean",
                                description: "Create file if it doesn't exist",
                            },
                        },
                        required: ["path", "content"],
                    },
                },
                {
                    name: "fs_list",
                    description: "List directory contents",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: {
                                type: "string",
                                description: "Directory path to list",
                            },
                            depth: {
                                type: "number",
                                description: "Maximum depth to recurse",
                            },
                            includeHidden: {
                                type: "boolean",
                                description: "Include hidden files",
                            },
                        },
                        required: ["path"],
                    },
                },
                {
                    name: "fs_delete",
                    description: "Delete a file or directory",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: {
                                type: "string",
                                description: "File or directory path to delete (absolute path)",
                            },
                            recursive: {
                                type: "boolean",
                                description: "If deleting a directory, recursively delete all contents (default: false). Set to true to delete non-empty directories.",
                            },
                        },
                        required: ["path"],
                    },
                },
            ];
            // Add command execution tool if not in SAFE mode
            if (this.mode !== "SAFE") {
                tools.push({
                    name: "cmd_execute",
                    description: "Execute shell command",
                    inputSchema: {
                        type: "object",
                        properties: {
                            command: {
                                type: "string",
                                description: "Command to execute",
                            },
                            args: {
                                type: "array",
                                items: { type: "string" },
                                description: "Command arguments",
                            },
                            cwd: {
                                type: "string",
                                description: "Working directory",
                            },
                            timeout: {
                                type: "number",
                                description: "Timeout in milliseconds",
                            },
                            useSudo: {
                                type: "boolean",
                                description: "Execute command with sudo privileges",
                            },
                            sudoPassword: {
                                type: "string",
                                description: "Sudo password (optional, for passwordless sudo leave empty)",
                            },
                        },
                        required: ["command"],
                    },
                });
                // Add browser automation tool
                tools.push({
                    name: "browser_automation",
                    description: "Automate browser interactions for downloading files from websites that require user interaction",
                    inputSchema: {
                        type: "object",
                        properties: {
                            url: {
                                type: "string",
                                description: "URL to navigate to",
                            },
                            actions: {
                                type: "array",
                                description: "Sequence of browser actions to perform",
                                items: {
                                    type: "object",
                                    properties: {
                                        type: {
                                            type: "string",
                                            enum: ["navigate", "click", "fill", "select", "wait", "screenshot", "download", "extract_text", "get_url"],
                                        },
                                        selector: { type: "string" },
                                        value: { type: "string" },
                                        url: { type: "string" },
                                        waitFor: { type: "string" },
                                        timeout: { type: "number" },
                                        options: { type: "string" },
                                        saveTo: { type: "string" },
                                        screenshotPath: { type: "string" },
                                    },
                                    required: ["type"],
                                },
                            },
                            headless: { type: "boolean" },
                            downloadPath: { type: "string" },
                            timeout: { type: "number" },
                        },
                        required: ["url", "actions"],
                    },
                });
                tools.push({
                    name: "interactive_download",
                    description: "Simplified tool for downloading files from websites that require form interaction",
                    inputSchema: {
                        type: "object",
                        properties: {
                            url: { type: "string" },
                            formFills: {
                                type: "object",
                                additionalProperties: { type: "string" },
                            },
                            downloadButtonSelector: { type: "string" },
                            saveAs: { type: "string" },
                            headless: { type: "boolean" },
                        },
                        required: ["url"],
                    },
                });
            }
            return { tools };
        });
        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            if (!args || typeof args !== "object") {
                throw new Error("Invalid arguments");
            }
            try {
                switch (name) {
                    case "fs_read": {
                        const filePath = args.path;
                        const maxBytes = args.maxBytes || 10 * 1024 * 1024;
                        const result = await this.fsTools.read(filePath, maxBytes);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                        };
                    }
                    case "fs_write": {
                        const filePath = args.path;
                        const content = args.content;
                        const create = args.create ?? true;
                        const result = await this.fsTools.write(filePath, content, create);
                        // Emit live update event for file changes
                        this.emitFileUpdate(filePath, content);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                        };
                    }
                    case "fs_list": {
                        const dirPath = args.path;
                        const depth = args.depth || 1;
                        const includeHidden = args.includeHidden || false;
                        const result = await this.fsTools.list(dirPath, depth, includeHidden);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                        };
                    }
                    case "fs_delete": {
                        const filePath = args.path;
                        const recursive = args.recursive || false;
                        const result = await this.fsTools.delete(filePath, recursive);
                        // Emit live update event for file deletion
                        this.emitFileUpdate(filePath, null);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                        };
                    }
                    case "cmd_execute": {
                        if (this.mode === "SAFE") {
                            throw new Error("Command execution not allowed in SAFE mode");
                        }
                        const command = args.command;
                        const cmdArgs = args.args || [];
                        const cwd = args.cwd;
                        const timeout = args.timeout || 300000;
                        const useSudo = args.useSudo || false;
                        const sudoPassword = args.sudoPassword;
                        const result = await this.cmdTools.execute(command, cmdArgs, cwd, timeout, useSudo, sudoPassword);
                        if (result.needsSudo && !useSudo) {
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: JSON.stringify({
                                            error: "SUDO_REQUIRED",
                                            message: "This command requires sudo privileges. Please retry with useSudo: true",
                                            command: command,
                                            args: cmdArgs,
                                            stderr: result.stderr,
                                        }, null, 2),
                                    },
                                ],
                                isError: true,
                            };
                        }
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                        };
                    }
                    case "browser_automation": {
                        if (this.mode === "SAFE") {
                            throw new Error("Browser automation not allowed in SAFE mode");
                        }
                        const url = args.url;
                        const actions = args.actions;
                        const headless = args.headless ?? true;
                        const downloadPath = args.downloadPath;
                        const timeout = args.timeout || 300000;
                        const browserTools = downloadPath
                            ? new BrowserTools(this.security, downloadPath)
                            : this.browserTools;
                        const result = await browserTools.executeActions(url, actions, headless, timeout);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                            isError: !result.success,
                        };
                    }
                    case "interactive_download": {
                        if (this.mode === "SAFE") {
                            throw new Error("Browser automation not allowed in SAFE mode");
                        }
                        const url = args.url;
                        const formFills = args.formFills;
                        const downloadButtonSelector = args.downloadButtonSelector;
                        const saveAs = args.saveAs;
                        const headless = args.headless ?? true;
                        const browserTools = saveAs
                            ? new BrowserTools(this.security, path.dirname(path.resolve(saveAs)))
                            : this.browserTools;
                        const result = await browserTools.interactiveDownload(url, formFills, downloadButtonSelector, saveAs, headless);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                            isError: !result.success,
                        };
                    }
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: errorMessage,
                            }, null, 2),
                        },
                    ],
                    isError: true,
                };
            }
        });
    }
    setupExpressRoutes() {
        // Parse JSON bodies
        this.app.use(express.json());
        // CORS headers for Claude Code
        this.app.use((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
            res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Id, X-API-Key");
            if (req.method === "OPTIONS") {
                res.sendStatus(200);
                return;
            }
            next();
        });
        // API Key Authentication (if enabled)
        if (this.apiKey) {
            console.log("[Auth] API key authentication enabled");
            this.app.use("/mcp", (req, res, next) => {
                const apiKey = req.headers["x-api-key"] ||
                    req.headers["authorization"]?.replace("Bearer ", "") ||
                    req.query.apiKey;
                if (!apiKey || apiKey !== this.apiKey) {
                    console.warn(`[Auth] Rejected request from ${req.ip || "unknown"} - invalid or missing API key`);
                    return res.status(401).json({
                        error: "Unauthorized",
                        message: "Invalid or missing API key. Provide API key via X-API-Key header, Authorization: Bearer <key>, or ?apiKey=<key> query parameter."
                    });
                }
                console.log(`[Auth] Authenticated request from ${req.ip || "unknown"}`);
                next();
            });
            // Also protect live updates endpoint
            this.app.use("/updates", (req, res, next) => {
                const apiKey = req.headers["x-api-key"] ||
                    req.headers["authorization"]?.replace("Bearer ", "") ||
                    req.query.apiKey;
                if (!apiKey || apiKey !== this.apiKey) {
                    console.warn(`[Auth] Rejected updates request from ${req.ip || "unknown"} - invalid API key`);
                    res.status(401).write(`data: ${JSON.stringify({ type: "error", message: "Unauthorized: Invalid API key" })}\n\n`);
                    res.end();
                    return;
                }
                next();
            });
        }
        else {
            console.warn("[Auth] No API key set - server accepts all localhost requests");
        }
        // Health check endpoint
        this.app.get("/health", (req, res) => {
            res.json({
                status: "ok",
                mode: this.mode,
                server: "operastudio-filesystem",
                version: "0.1.0",
            });
        });
        // MCP endpoint - handles all MCP protocol requests
        this.app.post("/mcp", async (req, res) => {
            try {
                // Create a new transport for each request to prevent session collisions
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    enableJsonResponse: false, // Use SSE for live updates
                    allowedOrigins: ["*"], // Allow all origins (adjust for production)
                });
                res.on("close", () => {
                    transport.close().catch(console.error);
                });
                await this.server.connect(transport);
                await transport.handleRequest(req, res, req.body);
            }
            catch (error) {
                console.error("[MCP HTTPS] Error handling request:", error);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: "Internal server error",
                        message: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            }
        });
        // Live updates endpoint (SSE) for file changes
        this.app.get("/updates", (req, res) => {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
            const clientId = randomUUID();
            console.log(`[Live Updates] Client connected: ${clientId}`);
            // Add client to broadcast list
            this.sseClients.add(res);
            // Send initial connection message
            res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);
            // Keep connection alive with heartbeat
            const heartbeat = setInterval(() => {
                try {
                    res.write(`: heartbeat\n\n`);
                }
                catch (error) {
                    // Client disconnected
                    clearInterval(heartbeat);
                    this.sseClients.delete(res);
                }
            }, 30000);
            req.on("close", () => {
                clearInterval(heartbeat);
                this.sseClients.delete(res);
                console.log(`[Live Updates] Client disconnected: ${clientId}`);
                res.end();
            });
            req.on("error", () => {
                clearInterval(heartbeat);
                this.sseClients.delete(res);
                res.end();
            });
        });
    }
    /**
     * Emit file update event and broadcast to all connected SSE clients
     */
    emitFileUpdate(filePath, content) {
        console.log(`[File Update] ${filePath} - ${content ? "updated" : "deleted"}`);
        const updateEvent = {
            type: "file_update",
            path: filePath,
            action: content ? "updated" : "deleted",
            timestamp: new Date().toISOString(),
            content: content ? content.substring(0, 100) + "..." : null, // Preview only
        };
        const message = `data: ${JSON.stringify(updateEvent)}\n\n`;
        // Broadcast to all connected clients
        const disconnectedClients = [];
        this.sseClients.forEach((client) => {
            try {
                client.write(message);
            }
            catch (error) {
                // Client disconnected, mark for removal
                disconnectedClients.push(client);
            }
        });
        // Clean up disconnected clients
        disconnectedClients.forEach((client) => {
            this.sseClients.delete(client);
        });
        console.log(`[Live Updates] Broadcasted to ${this.sseClients.size} client(s)`);
    }
    async start() {
        return new Promise((resolve, reject) => {
            try {
                if (this.useHttps) {
                    if (!this.certPath || !this.keyPath) {
                        throw new Error("HTTPS requires certPath and keyPath to be provided");
                    }
                    // Check if certificate files exist
                    if (!fs.existsSync(this.certPath) || !fs.existsSync(this.keyPath)) {
                        console.error(`\n❌ Error: SSL certificate files not found!\n` +
                            `   Certificate: ${this.certPath}\n` +
                            `   Key: ${this.keyPath}\n\n` +
                            `   Generate certificates with:\n` +
                            `   openssl req -x509 -newkey rsa:4096 -nodes \\\n` +
                            `     -keyout localhost-key.pem -out localhost.pem \\\n` +
                            `     -days 365 -subj "/CN=localhost" \\\n` +
                            `     -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"\n\n` +
                            `   Or use HTTP mode: npm run start:https:dev -- --http\n`);
                        throw new Error("SSL certificates not found");
                    }
                    const options = {
                        key: fs.readFileSync(this.keyPath),
                        cert: fs.readFileSync(this.certPath),
                    };
                    this.httpServer = https.createServer(options, this.app);
                }
                else {
                    this.httpServer = http.createServer(this.app);
                }
                this.httpServer.listen(this.port, () => {
                    const protocol = this.useHttps ? "https" : "http";
                    console.log(`OperaStudio HTTPS MCP Server started on ${protocol}://localhost:${this.port}`);
                    console.log(`Mode: ${this.mode}`);
                    console.log(`MCP endpoint: ${protocol}://localhost:${this.port}/mcp`);
                    console.log(`Health check: ${protocol}://localhost:${this.port}/health`);
                    console.log(`Live updates: ${protocol}://localhost:${this.port}/updates`);
                    resolve();
                });
                this.httpServer.on("error", (error) => {
                    if (error.code === "EADDRINUSE") {
                        console.error(`\n❌ Error: Port ${this.port} is already in use.\n` +
                            `   Please use a different port:\n` +
                            `   npm run start:https:dev -- ${this.mode} <different-port>\n` +
                            `   Or set MCP_PORT environment variable: MCP_PORT=3002 npm run start:https:dev\n`);
                    }
                    else {
                        console.error("Server error:", error);
                    }
                    reject(error);
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    async stop() {
        return new Promise((resolve) => {
            if (this.httpServer) {
                this.httpServer.close(() => {
                    console.log("MCP HTTPS Server stopped");
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
}
// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0] ||
    process.env.MCP_MODE ||
    "SAFE";
const port = parseInt(args[1] || process.env.MCP_PORT || "3001");
// Default to HTTPS unless explicitly disabled
const useHttps = !args.includes("--http") && (args.includes("--https") || process.env.MCP_HTTPS !== "false");
const defaultCertPath = path.join(process.cwd(), "localhost.pem");
const defaultKeyPath = path.join(process.cwd(), "localhost-key.pem");
const certPath = process.env.MCP_CERT_PATH || defaultCertPath;
const keyPath = process.env.MCP_KEY_PATH || defaultKeyPath;
const apiKey = process.env.MCP_API_KEY;
// Start server
const server = new OperaStudioHTTPSMCPServer(mode, port, useHttps, certPath, keyPath, apiKey);
server.start().catch((error) => {
    console.error("Failed to start MCP HTTPS server:", error);
    process.exit(1);
});
// Graceful shutdown
process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await server.stop();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    console.log("\nShutting down...");
    await server.stop();
    process.exit(0);
});
//# sourceMappingURL=https-server.js.map