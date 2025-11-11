#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { SecurityPolicy } from "./security.js";
import { FileSystemTools } from "./tools/filesystem.js";
import { CommandTools } from "./tools/command.js";
import { BrowserTools } from "./tools/browser.js";
import * as os from "os";
import * as path from "path";
/**
 * MCP Server for OperaStudio
 * Provides file system and command execution tools with security mode restrictions
 */
class OperaStudioMCPServer {
    server;
    security;
    fsTools;
    cmdTools;
    browserTools;
    mode;
    constructor(mode = "SAFE") {
        this.mode = mode;
        this.security = new SecurityPolicy(mode);
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
        this.setupHandlers();
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
                // Add browser automation tool for interactive web tasks
                tools.push({
                    name: "browser_automation",
                    description: "Automate browser interactions for downloading files from websites that require user interaction (e.g., selecting language, filling forms, clicking buttons). Use this for sites like Windows ISO downloads that require form submissions.",
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
                                            description: "Action type: navigate (go to URL), click (click element), fill (fill input), select (select dropdown), wait (wait for condition), screenshot (take screenshot), download (wait for download), extract_text (get text from element), get_url (get current URL)",
                                        },
                                        selector: {
                                            type: "string",
                                            description: "CSS selector for the element (required for click, fill, select, extract_text)",
                                        },
                                        value: {
                                            type: "string",
                                            description: "Value to fill/select (required for fill, select)",
                                        },
                                        url: {
                                            type: "string",
                                            description: "URL to navigate to (for navigate action)",
                                        },
                                        waitFor: {
                                            type: "string",
                                            description: "What to wait for: 'load', 'networkidle', 'domcontentloaded', 'download', or a CSS selector",
                                        },
                                        timeout: {
                                            type: "number",
                                            description: "Timeout in milliseconds for this action",
                                        },
                                        options: {
                                            type: "string",
                                            description: "For select action: 'value', 'label', or 'index' (default: 'value')",
                                        },
                                        saveTo: {
                                            type: "string",
                                            description: "Path to save download (for download action)",
                                        },
                                        screenshotPath: {
                                            type: "string",
                                            description: "Path to save screenshot (for screenshot action)",
                                        },
                                    },
                                    required: ["type"],
                                },
                            },
                            headless: {
                                type: "boolean",
                                description: "Run browser in headless mode (default: true)",
                            },
                            downloadPath: {
                                type: "string",
                                description: "Directory to save downloads (default: ~/Downloads)",
                            },
                            timeout: {
                                type: "number",
                                description: "Default timeout in milliseconds for all actions (default: 300000 = 5 minutes)",
                            },
                        },
                        required: ["url", "actions"],
                    },
                });
                // Simplified interactive download tool
                tools.push({
                    name: "interactive_download",
                    description: "Simplified tool for downloading files from websites that require form interaction. Automatically handles form filling and download button clicking.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            url: {
                                type: "string",
                                description: "URL of the download page",
                            },
                            formFills: {
                                type: "object",
                                description: "Object mapping CSS selectors to values for form fields (e.g., {'select#language': 'English', 'select#edition': 'Windows 11'})",
                                additionalProperties: {
                                    type: "string",
                                },
                            },
                            downloadButtonSelector: {
                                type: "string",
                                description: "CSS selector for the download button to click",
                            },
                            saveAs: {
                                type: "string",
                                description: "Path where to save the downloaded file (default: ~/Downloads)",
                            },
                            headless: {
                                type: "boolean",
                                description: "Run browser in headless mode (default: true)",
                            },
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
                        const path = args.path;
                        const maxBytes = args.maxBytes || 10 * 1024 * 1024;
                        const result = await this.fsTools.read(path, maxBytes);
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
                        const path = args.path;
                        const content = args.content;
                        const create = args.create ?? true;
                        const result = await this.fsTools.write(path, content, create);
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
                        const path = args.path;
                        const depth = args.depth || 1;
                        const includeHidden = args.includeHidden || false;
                        const result = await this.fsTools.list(path, depth, includeHidden);
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
                        const path = args.path;
                        const recursive = args.recursive || false;
                        const result = await this.fsTools.delete(path, recursive);
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
                        const timeout = args.timeout || 300000; // 5 minutes for installations
                        const useSudo = args.useSudo || false;
                        const sudoPassword = args.sudoPassword;
                        const result = await this.cmdTools.execute(command, cmdArgs, cwd, timeout, useSudo, sudoPassword);
                        // If command needs sudo but wasn't requested, return special error
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
                        // Create browser tools instance with custom download path if provided
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
                        // Create browser tools instance with custom save path if provided
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
    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("OperaStudio MCP Server started");
        console.error(`Mode: ${this.mode}`);
    }
}
// Get mode from command line args or environment
const mode = process.argv[2] || process.env.MCP_MODE || "SAFE";
// Start server
const server = new OperaStudioMCPServer(mode);
server.start().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map