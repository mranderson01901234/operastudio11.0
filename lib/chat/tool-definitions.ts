/**
 * Tool definitions for Gemini function calling.
 * These tools allow the LLM to interact with the local file system via MCP.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      required?: boolean;
      items?: {
        type: string;
      };
    }>;
    required: string[];
  };
}

/**
 * File system tools available via MCP server.
 * These tools are only available when an MCP session is active.
 */
export const FILE_TOOLS: ToolDefinition[] = [
  {
    name: "fs_read",
    description: "Read the contents of a file. Use this to read files that are not currently open in the editor, or to get the latest version of a file from disk. PATH RESOLUTION: Server-side preprocessing may have already resolved paths - check the user message for resolved paths. If path not resolved, try relative to current working directory first, then search common locations if needed. Use absolute paths in tool calls.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to read. If user gives just a filename, first search for it using cmd_execute with 'find' command, then use the found absolute path."
        },
        maxBytes: {
          type: "number",
          description: "Maximum bytes to read (default: 10MB). Use this to limit reading very large files."
        }
      },
      required: ["path"]
    }
  },
  {
    name: "fs_write",
    description: "Write content to a file. USE THIS TOOL when asked to edit, rewrite, or modify a file WITH SPECIFIC CHANGES. CRITICAL: If user says 'edit [filename]' or 'let's edit [filename]' WITHOUT specifying what to change, use fs_read instead to open the file - DO NOT call fs_write until user specifies the changes. DO NOT output file content in your message first - call this tool FIRST, then provide a brief confirmation. This will create the file if it doesn't exist, or overwrite it if it does. When editing files that are open in the editor, this will update the editor view automatically. Always write the complete file content, not partial content. CRITICAL: If multiple files with the same name are open, you MUST use the FULL ABSOLUTE PATH to identify the correct file. NEVER use just the filename - always use the complete path. WORKFLOW INTEGRATION: This tool can be used to save content from other tools - for example, after using web_search to find information, you can use fs_write to save the search results as a document. When users ask to 'save to Desktop' or 'create a document', use this tool with a descriptive filename (e.g., '~/Desktop/ai-trends-2025-01-27.md'). Use kebab-case filenames and include dates when relevant.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "FULL ABSOLUTE PATH to the file to write (e.g., '/home/user/project/README.md'). CRITICAL: If multiple files with the same name exist, you MUST use the full path to specify which file. Use the exact path from the file context, especially the active file path when user says 'this file'."
        },
        content: {
          type: "string",
          description: "Complete file content to write. Include all content, not just changes."
        },
        create: {
          type: "boolean",
          description: "Create file if it doesn't exist (default: true)"
        }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "fs_list",
    description: "List files and directories in a given path. Use this to explore the file system structure, find files, or check what's in a directory. PATH RESOLUTION: If the user references a directory by name only (e.g., '2.0', 'my project'), resolve it relative to the current working directory first. If not found there, use cmd_execute with 'find' to locate it. Always use absolute paths. For large directories (100+ items), summarize the results instead of listing everything - report total count, main subdirectories, and file types present.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list. Use absolute path (e.g., '/home/user/Desktop/2.0' or '~/Desktop/2.0'). If user gives a directory name, resolve relative to current working directory first, then search with 'find' if needed."
        },
        depth: {
          type: "number",
          description: "Maximum depth to recurse into subdirectories (default: 1). Use 1 for single directory listing. For large directories, keep depth=1 to avoid overwhelming output."
        },
        includeHidden: {
          type: "boolean",
          description: "Include hidden files (files starting with '.', default: false)"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "fs_delete",
    description: "Delete a file or directory. USE THIS TOOL when the user asks you to delete, remove, or clean up files or directories. CRITICAL: This tool actually deletes files - use it carefully. For directories, set recursive: true to delete non-empty directories. This tool REQUIRES an absolute path. If the user references a file/directory by name only, first use cmd_execute with 'find' to locate it, then use the full absolute path here. IMPORTANT: Only available in Balanced or Unrestricted security modes (not available in Safe mode).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File or directory path to delete (MUST be an absolute path, e.g., '/home/user/file.txt' or '~/Desktop/folder'). If you only have a name, use cmd_execute with 'find' command first to locate it."
        },
        recursive: {
          type: "boolean",
          description: "If deleting a directory, recursively delete all contents (default: false). Set to true to delete non-empty directories. For files, this parameter is ignored."
        }
      },
      required: ["path"]
    }
  },
];

/**
 * Command execution tool - available from any context when MCP session is active.
 * This tool can be used from GitHub, Email, or File System contexts.
 */
export const CMD_EXECUTE_TOOL: ToolDefinition = {
  name: "cmd_execute",
  description: "Execute shell commands on the user's system. Use this tool to DOWNLOAD FILES (wget, curl), install software (snap for modern apps like Opera/Firefox, apt for system packages, brew on macOS), run development tools (git, npm, yarn), execute scripts, search for directories/files, search text in files (grep), or perform any system operations the user requests. CRITICAL DOWNLOAD CAPABILITY: You CAN download files including ISO images, software installers, documents, etc. Use 'wget' or 'curl' commands to download files. Example: Download ISO to Downloads: command='wget', args=['-O', '~/Downloads/windows10.iso', 'https://example.com/file.iso']. For large files, use timeout parameter (e.g., timeout: 300000 for 5 minutes). CRITICAL: When a user references a directory or file by name only (e.g., '2.0 directory'), use this tool with the 'find' command to locate it before using fs_list or fs_read. Example: command='find', args=['~', '-type', 'd', '-name', '2.0', '-maxdepth', '3'] to search for a directory named '2.0'. GREP FOR TEXT SEARCH: Use 'grep' command to search for text patterns in files. Example: command='grep', args=['-r', '-n', 'searchterm', '/path/to/directory'] to recursively search for 'searchterm' in all files. Use '-i' for case-insensitive, '-l' to show only filenames, '-n' to show line numbers. For searching in specific file types: command='grep', args=['-r', '--include=*.ts', '--include=*.tsx', 'pattern', '/path']. This tool has full access to execute commands - use it proactively when users ask to download files, install packages, run commands, search for files/directories, search text in files, or perform system tasks. Examples: Download file with 'wget -O ~/Downloads/file.iso https://url.com/file.iso', install Opera browser with 'snap install opera' (useSudo: true), install system package with 'apt install <package>' (useSudo: true), run 'npm install', check 'git status', find directories with 'find ~ -type d -name <name>', search text with 'grep -r pattern /path'. IMPORTANT: For downloading files, use 'wget' or 'curl'. For modern browsers/apps, use 'snap install <package>'. For system packages, use 'apt install <package>'. If a command fails with 'Permission denied' or 'SUDO_REQUIRED' error, retry the same command with useSudo: true. AVAILABLE FROM ANY CONTEXT: This tool can be used when working with GitHub repositories, Email, or File System - you don't need to be in File System context to use it.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to execute (e.g., 'git', 'npm', 'apt', 'ls', 'node'). Do not include arguments here, use the args array instead. For sudo commands, set useSudo: true instead of including 'sudo' in the command."
      },
      args: {
        type: "array",
        description: "Command arguments as an array of strings. For example, for 'apt install opera', use command: 'apt', args: ['install', 'opera']. For 'sudo apt install opera', use command: 'apt', args: ['install', 'opera'], useSudo: true",
        items: {
          type: "string"
        }
      },
      cwd: {
        type: "string",
        description: "Working directory where the command should be executed (absolute path, default: current directory)"
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000 = 30 seconds). Use this for commands that might take a long time."
      },
      useSudo: {
        type: "boolean",
        description: "Execute command with sudo privileges. Set to true if command requires root/admin access (e.g., installing packages with apt, modifying system files). If a command fails with permission error, automatically retry with useSudo: true."
      }
    },
    required: ["command"]
  }
};

/**
 * Change working directory tool - allows LLM to change the persistent working directory.
 * This affects the default directory for file operations and command execution.
 */
export const CHANGE_DIRECTORY_TOOL: ToolDefinition = {
  name: "change_directory",
  description: "Change the current working directory. This sets a persistent working directory that will be used as the default for file operations (fs_read, fs_write, fs_list) and command execution (cmd_execute) unless explicitly overridden. The directory persists across chat sessions. Use this when the user asks to 'change directory', 'cd', 'navigate to', or 'work in' a specific directory. PATH RESOLUTION: Server-side preprocessing may have already resolved paths - check user message. If not resolved, try relative to current directory first, then search common locations (~/Desktop, ~/Documents, ~/Downloads, ~) if needed. Use absolute paths.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path to change to. MUST be an absolute path (e.g., '/home/user/Desktop/3.0'). If user gives just a name (e.g., '3.0'), first use cmd_execute with 'find' to locate it, then use the found absolute path here. Search common locations: ~/Desktop, ~/Documents, ~/Downloads, ~."
      }
    },
    required: ["path"]
  }
};

/**
 * Undo last operation tool - allows LLM to undo the last destructive file operation.
 * This restores files that were deleted or overwritten.
 */
export const UNDO_TOOL: ToolDefinition = {
  name: "undo",
  description: "Undo the last destructive file operation (fs_write or fs_delete). This restores files that were deleted or overwritten to their previous state. Use this when the user asks to 'undo', 'revert', 'restore', or 'go back' after a file operation. Only the most recent operation can be undone. If the user wants to undo multiple operations, they need to call this tool multiple times.",
  parameters: {
    type: "object",
    properties: {},
    required: []
  }
};

/**
 * Get tool definitions formatted for Gemini API.
 * Converts our ToolDefinition format to Gemini's functionDeclarations format.
 */
export function getGeminiToolDefinitions(): Array<{
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];
  };
}> {
  return FILE_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: tool.parameters.type,
      properties: Object.fromEntries(
        Object.entries(tool.parameters.properties).map(([key, value]) => [
          key,
          {
            type: value.type,
            description: value.description
          }
        ])
      ),
      required: tool.parameters.required
    }
  }));
}

