"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal, User as UserIcon, Loader2, ImagePlus, X, Copy, ThumbsUp, ThumbsDown, Undo2, AlertTriangle } from "lucide-react";
import { ChatTabs } from "./chat-tabs";
import { useFileSystem } from "@/contexts/filesystem-context";
import { useFileEditor } from "@/contexts/file-editor-context";
import { useEmail, type Email } from "@/contexts/email-context";
import { useImagen } from "@/contexts/imagen-context";
import { useImageViewer } from "@/contexts/image-viewer-context";
import { useChatInput } from "@/contexts/chat-input-context";
import { SecurityModeSelector } from "@/components/filesystem/security-mode-selector";
import { useUser, SignInButton, SignUpButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import type { FileState } from "@/contexts/file-editor-context";
import { executeToolCall, generateToolCallId, formatToolResultForLLM, type ToolCall, type ToolResult } from "@/lib/chat/tool-handler";
import { createSearchResultMetadata } from "@/lib/search/formatter";
import type { SearchResultMetadata } from "@/lib/search/search-result-types";
import { useSystemInfo } from "@/hooks/use-system-info";
import { useChatManager } from "@/contexts/chat-context";
import { useWorkingDirectory } from "@/contexts/working-directory-context";
import { MessageContent } from "./message-content";
import type { ImageAttachment } from "@/lib/types/chat";
import type { 
  SystemInfo, 
  ComprehensiveSoftwareInventory,
  FileSystemIndex,
  ProjectInfo,
  ImportantFile,
  RunningState,
} from "@/lib/mcp/system-info-types";
import { 
  detectRepositoryReferences, 
  detectFileReferences, 
  isFileViewRequest,
  isRepositoryRequest,
  isGitHubViewRequest,
  isEmailViewRequest
} from "@/lib/chat/reference-detector";
import { useGitHub } from "@/contexts/github-context";
import { createAppLogger } from "@/lib/utils/logger";
// LOCAL MODEL DISABLED - Using Gemini only
// import { shouldUseLocalModel } from "@/lib/chat/task-router";
// Tool call status icons removed - responses flow naturally

const logger = createAppLogger("Chat Interface");

type MessageStatus = "streaming" | "complete" | "error";

interface Message {
  id: string;
  content: string;
  role: "assistant" | "user" | "system";
  status?: MessageStatus;
  metadata?: Record<string, unknown>;
  attachments?: ImageAttachment[];
  toolCalls?: Array<{
    id: string;
    name: string;
    status: "executing" | "completed" | "error";
    result?: unknown;
    error?: string;
    arguments?: Record<string, unknown>;
  }>;
}

type ChatToolCall = NonNullable<Message["toolCalls"]>[number];
type RenderableToolCall = ChatToolCall & { status: "completed" | "error" };

type OutboundMessage = {
  role: Message["role"];
  content: string;
};

// OperaStudio logo SVG component
function OperaStudioIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 text-foreground"
    >
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="m5.6 5.6 12.8 12.8" />
      <path d="m5.6 18.4 12.8-12.8" />
    </svg>
  );
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanMarkdown(content: string) {
  return content
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim();
}

function toOutboundMessages(messages: Message[]): OutboundMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function getThinkingMessage(metadata?: Record<string, unknown>): string {
  const thinking =
    metadata ? (metadata as { thinking?: unknown }).thinking : undefined;
  if (typeof thinking === "string" && thinking.trim().length > 0) {
    return thinking;
  }
  return "Processing your request...";
}

/**
 * Returns user-friendly action message for tool execution.
 * Hides technical tool names and shows natural language descriptions.
 */
function getToolActionMessage(toolName: string): string {
  const messages: Record<string, string> = {
    fs_read: "Opening file...",
    fs_write: "Saving changes...",
    fs_list: "Browsing files...",
    fs_delete: "Removing file...",
    cmd_execute: "Running command...",
    email_send: "Sending email...",
    email_reply: "Sending reply...",
    email_delete: "Deleting email...",
    email_archive: "Archiving email...",
    email_list: "Loading emails...",
    github_read_file: "Loading file from GitHub...",
    github_write_file: "Committing changes...",
    github_list_repos: "Loading repositories...",
    github_list_files: "Browsing repository...",
    github_get_commits: "Loading commit history...",
    github_get_issues: "Loading issues...",
    github_get_pulls: "Loading pull requests...",
    imagen_generate: "Generating image...",
  };

  return messages[toolName] || "Working...";
}

/**
 * Formats tool call arguments for display
 */
function formatToolArguments(args: Record<string, unknown>): string {
  const formatted: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.length > 100) {
      formatted.push(`${key}: "${value.substring(0, 100)}..." (${value.length} chars)`);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      formatted.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      formatted.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return formatted.join('\n');
}

/**
 * Formats tool call name for display (converts snake_case to Title Case)
 */
function formatToolName(toolName: string): string {
  return toolName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const TOOL_STATUS_CLASSES: Record<
  "completed" | "error",
  { text: string; bg: string; border: string }
> = {
  completed: {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  error: {
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeUnknown(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const safeArray = value.map((entry) => serializeUnknown(entry));
    return safeArray.join(", ");
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// Helper function to format bytes (for batch validation display)
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

function toKeyValueEntries(record: Record<string, unknown>): Array<{ label: string; value: string }> {
  return Object.entries(record).map(([key, value]) => {
    const formattedValue = serializeUnknown(value);
    const trimmed = formattedValue.trim();
    const shortened =
      trimmed.length > 600 ? `${trimmed.slice(0, 600)}… (${trimmed.length} chars)` : trimmed;
    return {
      label: key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      value: shortened.length > 0 ? shortened : "—",
    };
  });
}

function renderKeyValueGrid(entries: Array<{ label: string; value: string }>): React.ReactNode {
  if (entries.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-border/40 bg-muted/20">
      <table className="w-full">
        <tbody className="divide-y divide-border/30">
          {entries.map((entry, index) => (
            <tr
              key={`${entry.label}-${index}`}
              className="transition-colors hover:bg-muted/40"
            >
              <td className="px-4 py-3 text-sm font-semibold text-foreground/80 align-top w-[200px] min-w-[200px] max-w-[200px]">
                {entry.label}
              </td>
              <td className="px-4 py-3 text-sm text-foreground/90 whitespace-pre-wrap break-words font-mono">
                {entry.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderTextBlock(
  text: string,
  variant: "default" | "success" | "warning" | "error" = "default"
): React.ReactNode {
  if (!text.trim()) {
    return null;
  }

  const variantClasses: Record<"default" | "success" | "warning" | "error", string> = {
    default: "border-border/40 bg-muted/30 text-foreground",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    warning: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    error: "border-red-500/40 bg-red-500/10 text-red-200",
  };

  return (
    <div
      className={`rounded-lg border p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words max-h-80 overflow-y-auto ${variantClasses[variant]}`}
    >
      {text}
    </div>
  );
}

function getCommandLine(toolCall: ChatToolCall): string | null {
  const rawToolCall = toolCall as unknown as Record<string, unknown>;
  const payloadCommand =
    typeof rawToolCall.command === "string" ? String(rawToolCall.command) : null;

  const args =
    Array.isArray(rawToolCall.args)
      ? (rawToolCall.args as unknown[])
          .map((arg) => (typeof arg === "string" ? arg : serializeUnknown(arg)))
          .filter((value) => value.length > 0)
      : [];

  const argumentCommand =
    typeof toolCall.arguments?.command === "string" ? toolCall.arguments.command : null;

  const commandParts = [payloadCommand || argumentCommand, ...args].filter(Boolean);
  if (commandParts.length === 0) {
    return null;
  }
  return commandParts.join(" ");
}

function shouldDisplayStandardError(stderr?: string): boolean {
  if (!stderr) {
    return false;
  }
  const trimmed = stderr.trim();
  if (!trimmed) {
    return false;
  }
  return trimmed
    .split(/\r?\n/)
    .some((line) => line.trim().length > 0 && !line.trim().startsWith("W:"));
}

function buildToolSummary(toolCall: ChatToolCall): string | undefined {
  if (toolCall.status === "error") {
    if (typeof toolCall.error === "string" && toolCall.error.trim().length > 0) {
      return toolCall.error;
    }
    return "The tool reported an error.";
  }

  let normalizedResult: unknown = toolCall.result;
  if (isRecord(toolCall.result) && Object.prototype.hasOwnProperty.call(toolCall.result, "result")) {
    const nested = (toolCall.result as Record<string, unknown>).result;
    if (nested !== undefined) {
      normalizedResult = nested;
    }
  }

  switch (toolCall.name) {
    case "fs_write": {
      if (isRecord(normalizedResult)) {
        const path = typeof normalizedResult.path === "string" ? normalizedResult.path : "";
        const lines =
          typeof normalizedResult.lines === "number"
            ? `${normalizedResult.lines} line${normalizedResult.lines === 1 ? "" : "s"}`
            : null;
        const created =
          typeof normalizedResult.created === "boolean"
            ? normalizedResult.created
            : undefined;
        const action = created ? "Created" : "Updated";
        const pathLabel = path ? `"${path}"` : "the file";
        if (lines) {
          return `${action} ${pathLabel} (${lines}).`;
        }
        return `${action} ${pathLabel}.`;
      }
      return "File write completed.";
    }
    case "fs_delete": {
      if (isRecord(normalizedResult) && typeof normalizedResult.path === "string") {
        return `Removed "${normalizedResult.path}".`;
      }
      return "File deleted.";
    }
    case "fs_list": {
      if (isRecord(normalizedResult)) {
        const total = Array.isArray(normalizedResult.items)
          ? normalizedResult.items.length
          : Array.isArray(normalizedResult.files)
            ? normalizedResult.files.length
            : undefined;
        const directory =
          typeof normalizedResult.path === "string" ? normalizedResult.path : "directory";
        if (typeof total === "number") {
          return `Listed ${total} item${total === 1 ? "" : "s"} in ${directory}.`;
        }
      }
      return "Directory listing completed.";
    }
    case "cmd_execute": {
      const commandLine = getCommandLine(toolCall);
      const resultRecord = isRecord(normalizedResult) ? normalizedResult : undefined;
      const exitCode =
        resultRecord && typeof resultRecord.exitCode === "number"
          ? resultRecord.exitCode
          : undefined;
      const success =
        resultRecord && typeof resultRecord.success === "boolean"
          ? resultRecord.success
          : exitCode === 0;
      if (commandLine) {
        if (success) {
          return `Executed "${commandLine}" successfully${typeof exitCode === "number" ? ` (exit code ${exitCode})` : ""}.`;
        }
        return `Command "${commandLine}" failed${typeof exitCode === "number" ? ` (exit code ${exitCode})` : ""}.`;
      }
      if (success) {
        return "Command completed successfully.";
      }
      return "Command execution failed.";
    }
    case "github_write_file": {
      if (isRecord(normalizedResult) && typeof normalizedResult.path === "string") {
        return `Committed updates to "${normalizedResult.path}".`;
      }
      return "GitHub file updated.";
    }
    case "github_read_file": {
      if (isRecord(normalizedResult) && typeof normalizedResult.path === "string") {
        return `Fetched "${normalizedResult.path}" from GitHub.`;
      }
      return "GitHub file retrieved.";
    }
    case "email_send":
    case "email_reply": {
      return "Email sent successfully.";
    }
    case "email_delete": {
      return "Email removed.";
    }
    case "email_archive": {
      return "Email archived.";
    }
    default:
      return undefined;
  }
}

interface ToolSection {
  title: string;
  content: React.ReactNode;
}

interface ToolDisplayData {
  summary?: string;
  sections: ToolSection[];
  statusVariant: "completed" | "error";
}

function buildToolDisplayData(toolCall: ChatToolCall): ToolDisplayData {
  const sections: ToolSection[] = [];

  if (toolCall.arguments && Object.keys(toolCall.arguments).length > 0) {
    sections.push({
      title: "Arguments",
      content: renderKeyValueGrid(toKeyValueEntries(toolCall.arguments)),
    });
  }

  const rawResult = toolCall.result;
  let normalizedResult: unknown = rawResult;
  if (isRecord(rawResult) && Object.prototype.hasOwnProperty.call(rawResult, "result")) {
    const nested = (rawResult as Record<string, unknown>).result;
    if (nested !== undefined) {
      normalizedResult = nested;
    }
  }

  if (toolCall.name === "cmd_execute") {
    const resultRecord = isRecord(normalizedResult)
      ? normalizedResult
      : isRecord(rawResult)
        ? rawResult
        : undefined;

    const commandLine = getCommandLine(toolCall);
    if (commandLine) {
      sections.push({
        title: "Command",
        content: (
          <div className="rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
            <p className="font-mono text-sm text-foreground">
              <span className="text-primary/80 font-bold">$</span> {commandLine}
            </p>
          </div>
        ),
      });
    }

    if (resultRecord) {
      const exitCode =
        typeof resultRecord.exitCode === "number" ? resultRecord.exitCode : undefined;
      const success =
        typeof resultRecord.success === "boolean"
          ? resultRecord.success
          : exitCode === 0
            ? true
            : undefined;
      const duration =
        typeof resultRecord.duration === "number" ? resultRecord.duration : undefined;

      const executionDetails: Record<string, unknown> = {};
      if (typeof exitCode === "number") executionDetails["Exit Code"] = exitCode;
      if (typeof success === "boolean") executionDetails["Success"] = success ? "Yes" : "No";
      if (typeof duration === "number") executionDetails["Duration (ms)"] = duration;

      if (Object.keys(executionDetails).length > 0) {
        sections.push({
          title: "Execution",
          content: renderKeyValueGrid(toKeyValueEntries(executionDetails)),
        });
      }

      const stdout =
        typeof resultRecord.stdout === "string"
          ? resultRecord.stdout
          : typeof normalizedResult === "string"
            ? normalizedResult
            : undefined;
      const stderrRaw =
        typeof resultRecord.stderr === "string" ? resultRecord.stderr : undefined;
      const stderr = shouldDisplayStandardError(stderrRaw) ? stderrRaw : undefined;
      const runtimeError =
        typeof resultRecord.error === "string" ? resultRecord.error : undefined;

      if (stdout && stdout.trim().length > 0) {
        sections.push({
          title: "Stdout",
          content: renderTextBlock(stdout.trim()),
        });
      }

      if (stderr && stderr.trim().length > 0) {
        sections.push({
          title: "Stderr",
          content: renderTextBlock(stderr.trim(), "error"),
        });
      }

      if (runtimeError && runtimeError.trim().length > 0) {
        sections.push({
          title: "Runtime Error",
          content: (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 font-mono text-sm leading-relaxed text-red-200 whitespace-pre-wrap break-words">
              {runtimeError}
            </div>
          ),
        });
      }
    }
  } else if (normalizedResult !== undefined && normalizedResult !== null) {
    if (isRecord(normalizedResult)) {
      sections.push({
        title: "Result Details",
        content: renderKeyValueGrid(toKeyValueEntries(normalizedResult)),
      });
    } else if (typeof normalizedResult === "string") {
      sections.push({
        title: "Result",
        content: renderTextBlock(normalizedResult),
      });
    } else {
      sections.push({
        title: "Result",
        content: renderTextBlock(serializeUnknown(normalizedResult)),
      });
    }
  }

  // Check for batch validation warnings
  const batchValidation = isRecord(rawResult) && "batchValidation" in rawResult
    ? rawResult.batchValidation as {
        requiresConfirmation: boolean;
        safetyLevel: "safe" | "moderate" | "dangerous";
        warnings: string[];
        targetCount: number;
        totalSize: number;
      } | undefined
    : undefined;

  if (batchValidation && batchValidation.requiresConfirmation) {
    const safetyColors = {
      safe: "text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10",
      moderate: "text-yellow-600 dark:text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
      dangerous: "text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/10",
    };

    sections.unshift({
      title: "⚠️ Batch Operation Warning",
      content: (
        <div className={`rounded-lg border p-4 space-y-3 ${safetyColors[batchValidation.safetyLevel]}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">
              {batchValidation.safetyLevel.toUpperCase()} Operation Detected
            </span>
          </div>
          <div className="text-sm space-y-1">
            <p><strong>Targets:</strong> {batchValidation.targetCount} items</p>
            <p><strong>Total Size:</strong> {formatBytes(batchValidation.totalSize)}</p>
          </div>
          {batchValidation.warnings.length > 0 && (
            <div className="text-sm">
              <p className="font-semibold mb-1">Warnings:</p>
              <ul className="list-disc list-inside space-y-1">
                {batchValidation.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ),
    });
  }

  if (toolCall.error) {
    sections.push({
      title: "Tool Error",
      content: (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 font-mono text-sm leading-relaxed text-red-200 whitespace-pre-wrap break-words">
          {typeof toolCall.error === "string" ? toolCall.error : serializeUnknown(toolCall.error)}
        </div>
      ),
    });
  }

  const summary = buildToolSummary(toolCall);
  const statusVariant = toolCall.status === "error" || toolCall.error ? "error" : "completed";

  return {
    summary,
    sections,
    statusVariant,
  };
}

function ToolCallCard({ toolCall }: { toolCall: RenderableToolCall }): React.ReactElement {
  const displayData = buildToolDisplayData(toolCall);

  return (
    <div
      className="mb-2"
      data-tool-call-id={toolCall.id}
      data-tool-name={toolCall.name}
      data-tool-status={toolCall.status}
    >
      {displayData.summary && (
        <p className="text-sm text-muted-foreground/80">{displayData.summary}</p>
      )}
    </div>
  );
}

function isRenderableToolCall(
  toolCall: ChatToolCall
): toolCall is RenderableToolCall {
  return toolCall.status === "completed" || toolCall.status === "error";
}

const ToolErrorNotice: React.FC<{ message: string }> = ({ message }) => {
  if (!message) {
    return null;
  }
  return (
    <div className="mb-3 text-sm text-red-600 dark:text-red-400 animate-in fade-in duration-300">
      Unable to complete action. {message}
    </div>
  );
};

/**
 * Builds a system message containing file context from open files.
 * This allows the LLM to know what files are currently open in the editor.
 */
function buildFileContextMessage(
  openFiles: Map<string, FileState>,
  activeFile: string | null,
  maxContextSize: number = 50000 // Reduced to ~50KB to save tokens and reduce rate limit issues
): string {
  const inferHomeDirectory = (filePath: string | null | undefined): string | null => {
    if (!filePath) {
      return null;
    }

    const normalized = filePath.replace(/\\/g, "/");

    if (normalized.startsWith("/home/")) {
      const segments = normalized.split("/").filter(Boolean);
      if (segments.length >= 2) {
        return `/${segments[0]}/${segments[1]}`;
      }
    }

    if (normalized.startsWith("/Users/")) {
      const segments = normalized.split("/").filter(Boolean);
      if (segments.length >= 2) {
        return `/${segments[0]}/${segments[1]}`;
      }
    }

    const windowsMatch = filePath.match(/^([A-Za-z]:\\Users\\[^\\]+)/);
    if (windowsMatch) {
      return windowsMatch[1];
    }

    return null;
  };

  const generalWorkspaceContextLines = [
    "- Assume the user is working from their local home directory (e.g., /home/<name>, /Users/<name>, or C:\\Users\\<name>).",
    "- Use that home directory as the default working directory unless the user explicitly specifies a different path.",
  ];

  if (openFiles.size === 0) {
    return [
      "Workspace context:",
      ...generalWorkspaceContextLines,
      "- No files are currently open in the editor.",
      "",
      "When suggesting file operations, refer to paths relative to the user's home directory unless told otherwise.",
    ].join("\n");
  }

  const files = Array.from(openFiles.values());
  const parts: string[] = [];
  
  // Always include active file first
  const activeFileState = activeFile ? files.find(f => f.path === activeFile) : null;
  const includedFiles: FileState[] = [];
  let contextSize = 0;

  if (activeFileState) {
    includedFiles.push(activeFileState);
    contextSize += activeFileState.content.length;
  }

  // Include other files if space allows
  for (const file of files) {
    if (file.path === activeFile) continue;
    if (contextSize + file.content.length > maxContextSize) {
      break;
    }
    includedFiles.push(file);
    contextSize += file.content.length;
  }

  const excludedCount = files.length - includedFiles.length;

  const inferredHome = includedFiles
    .map((file) => inferHomeDirectory(file.path))
    .find((value): value is string => Boolean(value));

  parts.push("The user has the following files open in the editor:");
  parts.push("");
  parts.push("Workspace context:");
  if (inferredHome) {
    parts.push(`- The user's home directory appears to be ${inferredHome}. Treat this as the default working directory unless the user specifies a different path.`);
  } else {
    generalWorkspaceContextLines.forEach((line) => parts.push(line));
  }
  parts.push("");
  parts.push("⚠️ CRITICAL: Multiple files may have the same filename but DIFFERENT paths.");
  parts.push("ALWAYS use the FULL FILE PATH when calling fs_write tool - NEVER use just the filename!");
  parts.push("");

  // Separate GitHub files from local files
  const githubFiles: FileState[] = [];
  const localFiles: FileState[] = [];
  
  includedFiles.forEach((file) => {
    if (file.path.startsWith("github://")) {
      githubFiles.push(file);
    } else {
      localFiles.push(file);
    }
  });

  // Process GitHub files
  if (githubFiles.length > 0) {
    parts.push("=== GITHUB REPOSITORY FILES ===");
    parts.push("");
    githubFiles.forEach((file, index) => {
      const isActive = file.path === activeFile;
      const statusParts: string[] = [];
      if (isActive) statusParts.push("currently active");
      if (file.isModified) statusParts.push("modified");
      
      const status = statusParts.length > 0 ? ` (${statusParts.join(", ")})` : "";
      
      // Parse GitHub path: github://owner/repo/path/to/file
      const githubPathMatch = file.path.match(/^github:\/\/([^\/]+)\/([^\/]+)\/(.+)$/);
      const owner = githubPathMatch ? githubPathMatch[1] : "";
      const repo = githubPathMatch ? githubPathMatch[2] : "";
      const filePath = githubPathMatch ? githubPathMatch[3] : file.path;
      const fileName = filePath.split("/").pop() || filePath;
      
      parts.push(`--- GITHUB FILE ${index + 1} ---`);
      parts.push(`Repository: ${owner}/${repo}`);
      parts.push(`File Path: ${filePath}${status}`);
      parts.push(`Filename: ${fileName}`);
      parts.push(`Language: ${file.language}`);
      if (isActive) {
        parts.push(`⚠️ THIS IS THE ACTIVE FILE - Use this file when user says 'this file'`);
        parts.push(`⚠️ For GitHub files, use github_read_file and github_write_file tools (NOT fs_read/fs_write)`);
        parts.push(`⚠️ GitHub tool parameters: owner="${owner}", repo="${repo}", path="${filePath}"`);
      }
      parts.push(`Content:`);
      parts.push(`\`\`\`${file.language}`);
      parts.push(file.content);
      parts.push(`\`\`\``);
      parts.push("");
    });
  }

  // Process local files
  if (localFiles.length > 0) {
    parts.push("=== LOCAL FILE SYSTEM FILES ===");
    parts.push("");
    localFiles.forEach((file, index) => {
      const isActive = file.path === activeFile;
      const statusParts: string[] = [];
      if (isActive) statusParts.push("currently active");
      if (file.isModified) statusParts.push("modified");
      
      const status = statusParts.length > 0 ? ` (${statusParts.join(", ")})` : "";
      const fileName = file.path.split("/").pop() || file.path.split("\\").pop() || file.path;
      
      parts.push(`--- LOCAL FILE ${index + 1} ---`);
      parts.push(`FULL PATH: ${file.path}${status}`);
      parts.push(`Filename only: ${fileName}`);
      parts.push(`Language: ${file.language}`);
      if (isActive) {
        parts.push(`⚠️ THIS IS THE ACTIVE FILE - Use this path when user says 'this file'`);
        parts.push(`⚠️ For local files, use fs_read and fs_write tools`);
      }
      parts.push(`Content:`);
      parts.push(`\`\`\`${file.language}`);
      parts.push(file.content);
      parts.push(`\`\`\``);
      parts.push("");
    });
  }

  if (excludedCount > 0) {
    parts.push(`Note: ${excludedCount} additional file(s) are open but not included due to size limits.`);
    parts.push("");
  }

  if (activeFile) {
    const isGitHubFile = activeFile.startsWith("github://");
    parts.push(`⚠️ IMPORTANT: The user is currently viewing: ${activeFile}`);
    parts.push(`When the user says 'this file', 'the file', 'the current file', or 'edit this file',`);
    parts.push(`they are referring to the ACTIVE file: ${activeFile}`);
    parts.push("");
    
    if (isGitHubFile) {
      // Parse GitHub path for active file
      const githubPathMatch = activeFile.match(/^github:\/\/([^\/]+)\/([^\/]+)\/(.+)$/);
      if (githubPathMatch) {
        const owner = githubPathMatch[1];
        const repo = githubPathMatch[2];
        const filePath = githubPathMatch[3];
        parts.push(`⚠️ ACTIVE FILE IS A GITHUB FILE:`);
        parts.push(`   Repository: ${owner}/${repo}`);
        parts.push(`   File Path: ${filePath}`);
        parts.push(`   Use github_read_file and github_write_file tools (NOT fs_read/fs_write)`);
        parts.push(`   Tool parameters: owner="${owner}", repo="${repo}", path="${filePath}"`);
        parts.push("");
      }
    } else {
      parts.push(`⚠️ ACTIVE FILE IS A LOCAL FILE:`);
      parts.push(`   Use fs_read and fs_write tools`);
      parts.push(`   Tool parameter: path="${activeFile}"`);
      parts.push("");
    }
  }

  parts.push("CRITICAL RULES FOR FILE OPERATIONS:");
  parts.push("");
  parts.push("1. DETERMINE FILE TYPE FIRST:");
  parts.push("   - GitHub files: Path starts with 'github://' (e.g., 'github://owner/repo/path/to/file.ts')");
  parts.push("   - Local files: Regular file paths (e.g., '/home/user/project/README.md')");
  parts.push("");
  parts.push("2. USE CORRECT TOOLS FOR EACH FILE TYPE:");
  parts.push("   - GitHub files: Use github_read_file and github_write_file");
  parts.push("     * Parse path: github://owner/repo/path/to/file → owner='owner', repo='repo', path='path/to/file'");
  parts.push("     * Example: github_write_file({owner: 'user', repo: 'myrepo', path: 'src/index.ts', content: '...'})");
  parts.push("   - Local files: Use fs_read and fs_write");
  parts.push("     * Use full absolute path");
  parts.push("     * Example: fs_write({path: '/home/user/project/README.md', content: '...'})");
  parts.push("");
  parts.push("3. WHEN USER SAYS 'THIS FILE' OR 'THE FILE':");
  parts.push("   - Use the ACTIVE file shown above");
  parts.push("   - Check if it's a GitHub file or local file");
  parts.push("   - Use the appropriate tool (github_* for GitHub, fs_* for local)");
  parts.push("");
  parts.push("4. ALWAYS use the FULL FILE PATH or parsed GitHub parameters, NEVER just the filename");
  parts.push("5. If multiple files have the same name, you MUST use the full path/GitHub params to distinguish them");
  parts.push("6. NEVER copy content from one file to another unless explicitly requested");
  parts.push("7. NEVER rewrite a file to match another file's content unless explicitly asked");
  parts.push("8. Each file path is UNIQUE - /path/to/file1/README.md is DIFFERENT from /path/to/file2/README.md");
  parts.push("");
  parts.push("CRITICAL WORKFLOW: When asked to modify, rewrite, or edit a file:");
  parts.push("");
  parts.push("IF user says 'edit [filename]' or 'let's edit [filename]' WITHOUT specifying changes:");
  parts.push("  - Use fs_read to read and open the file (it auto-opens in editor)");
  parts.push("  - Respond: 'Opened [filename] for editing.'");
  parts.push("  - DO NOT call fs_write until user specifies what to change");
  parts.push("  - STOP after opening - wait for user to provide edits");
  parts.push("");
  parts.push("IF user specifies changes (e.g., 'add X', 'remove Y', 'change Z to W'):");
  parts.push("STEP 1: Identify the ACTIVE file from above (or the file the user is referring to)");
  parts.push("STEP 2: Determine if it's a GitHub file or local file:");
  parts.push("   - GitHub file: Path starts with 'github://'");
  parts.push("   - Local file: Regular file path");
  parts.push("STEP 3: Call the appropriate tool:");
  parts.push("   - GitHub file: github_write_file({owner: '...', repo: '...', path: '...', content: '...'})");
  parts.push("   - Local file: fs_write({path: '...', content: '...'})");
  parts.push("STEP 4: After tool succeeds, provide a descriptive response explaining what was changed");
  parts.push("");
  parts.push("RESPONSE FORMATTING REQUIREMENTS:");
  parts.push("");
  parts.push("STRUCTURE: Your response MUST follow this format:");
  parts.push("1. HEADER: Brief summary statement (e.g., 'Updated [filename] to [main change]')");
  parts.push("2. BODY: Detailed explanation with bullet points");
  parts.push("   - Use bullet points (• or -) to list what was completed");
  parts.push("   - Each bullet should describe a specific change or task");
  parts.push("   - Be specific and concise");
  parts.push("3. CLOSING: Brief confirmation statement");
  parts.push("");
  parts.push("FILE NAMING IN RESPONSES (for display only, NOT for tool calls):");
  parts.push("- In your TEXT RESPONSE, use ONLY the filename (e.g., 'README.md') for readability");
  parts.push("- But in TOOL CALLS, use the correct format:");
  parts.push("  * GitHub files: github_write_file({owner: 'user', repo: 'repo', path: 'README.md', content: '...'})");
  parts.push("  * Local files: fs_write({path: '/home/user/project/README.md', content: '...'})");
  parts.push("- Example response: 'Updated README.md'");
  parts.push("- Example GitHub tool call: github_write_file({owner: 'user', repo: 'myrepo', path: 'README.md', content: '...'})");
  parts.push("- Example local tool call: fs_write({path: '/home/user/project/README.md', content: '...'})");
  parts.push("");
  parts.push("CONTENT GUIDELINES:");
  parts.push("- Describe WHAT was changed (e.g., 'Added error handling', 'Updated function signature', 'Fixed bug in validation')");
  parts.push("- If creating a new file, say so (e.g., 'Created new file X with Y functionality')");
  parts.push("- If modifying existing file, describe the changes (e.g., 'Updated X to add Y feature')");
  parts.push("- Use bullet points for multiple changes");
  parts.push("- DO NOT include the full file content in your response");
  parts.push("");
  parts.push("RULES:");
  parts.push("- NEVER output file content BEFORE calling the write tool");
  parts.push("- NEVER show file content in code blocks or markdown");
  parts.push("- NEVER include file content in your response text");
  parts.push("- ALWAYS call the write tool FIRST (github_write_file for GitHub files, fs_write for local files), then describe what was changed");
  parts.push("- The file editor updates automatically - you don't need to show content");
  parts.push("- If the write tool fails, report the error WITHOUT showing file content");
  parts.push("- For GitHub files: Always include a commit message (or let it default)");
  parts.push("- For GitHub files: Changes are committed to the repository, not just saved locally");
  parts.push("");
  parts.push("EXAMPLE FORMAT:");
  parts.push("Updated README.md to transform it into an enterprise-grade document.");
  parts.push("");
  parts.push("• Restructured the document with clear sections for overview, features, and getting started");
  parts.push("• Enhanced the heading to reflect an 'Enterprise Platform' focus");
  parts.push("• Added comprehensive tables for development scripts and implementation status");
  parts.push("• Improved the language and tone for professional presentation");
  parts.push("");
  parts.push("The README.md file has been successfully updated with a more structured and professional format.");

  return parts.join("\n");
}

/**
 * Builds a system message containing system environment information.
 * This provides the LLM with full context about the user's system.
 */
function buildSystemContextMessage(systemInfo: SystemInfo | null, minimal: boolean = false): string {
  if (!systemInfo) {
    return "";
  }

  const parts: string[] = [];
  
  // Minimal version for follow-up requests
  if (minimal) {
    parts.push("🖥️ SYSTEM ENVIRONMENT (Summary):");
    parts.push(`- Platform: ${systemInfo.os.platform}`);
    parts.push(`- Home: ${systemInfo.user.homeDirectory}`);
    parts.push(`- CWD: ${systemInfo.environment.cwd}`);
    parts.push(`- Node: ${systemInfo.environment.nodeVersion}`);
    return parts.join("\n");
  }
  
  parts.push("🖥️ SYSTEM ENVIRONMENT");
  parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  // OS Information - format compactly to discourage spacing
  parts.push("## **Operating System Details**");
  parts.push(`- Platform: ${systemInfo.os.platform}`);
  parts.push(`- Architecture: ${systemInfo.os.arch}`);
  if (systemInfo.os.version) {
    parts.push(`- Version: ${systemInfo.os.version}`);
  }
  parts.push(`- Hostname: ${systemInfo.os.hostname}`);
  
  // User Information - format compactly
  parts.push("## **User & Directory**");
  parts.push(`- Username: ${systemInfo.user.username}`);
  parts.push(`- Home Directory: ${systemInfo.user.homeDirectory}`);
  if (systemInfo.user.shell) {
    parts.push(`- Shell: ${systemInfo.user.shell}`);
  }
  parts.push(`- Current Working Directory: ${systemInfo.environment.cwd}`);
  
  // Environment Variables - format compactly
  parts.push("## **Software & Tools**");
  parts.push(`- Node.js Version: ${systemInfo.environment.nodeVersion}`);
  
  // COMPREHENSIVE SOFTWARE INVENTORY - format as compact bullet points
  if (systemInfo.software) {
    // Languages & Runtimes
    if (systemInfo.software.languages.node?.length) {
      parts.push(`- Node.js Version: ${systemInfo.software.languages.node[0].version}`);
    }
    if (systemInfo.software.languages.python?.length) {
      parts.push(`- Python Version: ${systemInfo.software.languages.python[0].version}`);
    }
    if (systemInfo.software.languages.rust) {
      parts.push(`- Rust Version: ${systemInfo.software.languages.rust.version}`);
    }
    if (systemInfo.software.languages.go) {
      parts.push(`- Go Version: ${systemInfo.software.languages.go.version}`);
    }
    
    // Package Managers
    if (systemInfo.software.packageManagers.npm) {
      parts.push(`- Package Managers: npm ${systemInfo.software.packageManagers.npm.version}`);
    }
    if (systemInfo.software.packageManagers.pip) {
      parts.push(`- Package Managers: pip ${systemInfo.software.packageManagers.pip.version}`);
    }
    
    // Development Tools
    const devTools: string[] = [];
    if (systemInfo.software.developmentTools.git) {
      devTools.push(`git ${systemInfo.software.developmentTools.git.version}`);
    }
    if (systemInfo.software.developmentTools.docker) {
      devTools.push(`docker ${systemInfo.software.developmentTools.docker.version}`);
    }
    if (devTools.length > 0) {
      parts.push(`- Dev Tools: ${devTools.join(", ")}`);
    }
    
    // Browsers
    if (systemInfo.software.browsers.length > 0) {
      parts.push(`- Browsers Installed: ${systemInfo.software.browsers.join(", ")}`);
    }
  } else if (systemInfo.installedSoftware) {
    // Fallback to legacy discovery
    if (systemInfo.installedSoftware.browsers.length > 0) {
      parts.push(`- Browsers Installed: ${systemInfo.installedSoftware.browsers.join(", ")}`);
    }
    if (systemInfo.installedSoftware.commonTools.length > 0) {
      parts.push(`- Dev Tools: ${systemInfo.installedSoftware.commonTools.join(", ")}`);
    }
  }
  

  return parts.join("\n");
}

/**
 * Builds a system message containing email context when an email is selected.
 * This allows the LLM to understand which email the user is referring to.
 */
function buildEmailContextMessage(activeEmail: string | null, emails: Map<string, Email>): string {
  if (!activeEmail) {
    return "";
  }

  const email = emails.get(activeEmail);
  if (!email) {
    return "";
  }

  const parts: string[] = [];
  
  parts.push("📧 EMAIL CONTEXT - CURRENTLY SELECTED EMAIL");
  parts.push("");
  parts.push("The user is currently viewing an email in the right sidebar. When the user says:");
  parts.push("- 'this email', 'the email', 'current email', 'selected email'");
  parts.push("- 'review this email', 'analyze this email', 'summarize this email'");
  parts.push("- 'write a reply', 'write a follow up', 'respond to this email'");
  parts.push("- 'delete this email', 'archive this email'");
  parts.push("");
  parts.push("They are referring to the email shown below:");
  parts.push("");
  parts.push("--- EMAIL DETAILS ---");
  parts.push(`Email ID: ${email.id}`);
  parts.push(`Subject: ${email.subject}`);
  parts.push(`From: ${email.from.name || email.from.email} <${email.from.email}>`);
  parts.push(`To: ${email.to.map(t => t.name || t.email).join(", ")}`);
  if (email.cc && email.cc.length > 0) {
    parts.push(`Cc: ${email.cc.map(c => c.name || c.email).join(", ")}`);
  }
  const emailDate = email.date instanceof Date ? email.date.toISOString() : String(email.date);
  parts.push(`Date: ${emailDate}`);
  if (email.labels && email.labels.length > 0) {
    parts.push(`Labels: ${email.labels.join(", ")}`);
  }
  parts.push("");
  parts.push("EMAIL CONTENT:");
  parts.push("---");
  // Prefer text content, fallback to HTML if text not available
  if (email.text) {
    parts.push(email.text);
  } else if (email.html) {
    // Strip HTML tags for cleaner context (basic stripping)
    const textContent = email.html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    parts.push(textContent);
  } else if (email.snippet) {
    parts.push(email.snippet);
  }
  parts.push("---");
  parts.push("");
  parts.push("⚠️ CRITICAL: When the user references 'this email' or asks to review/reply/delete/archive 'this email',");
  parts.push("they are referring to the email shown above. You MUST use the Email ID provided above for all operations.");
  parts.push("");
  parts.push("If the user asks to:");
  parts.push("- Review/analyze/summarize: Provide your analysis based on the email content above");
  parts.push(`- Write a reply/follow-up: Use email_reply tool with emailId: '${email.id}' and your suggested reply`);
  parts.push(`- Delete this email: Use email_delete tool with emailId: '${email.id}'`);
  parts.push(`- Archive this email: Use email_archive tool with emailId: '${email.id}'`);
  parts.push("");
  parts.push(`⚠️ ALWAYS use the Email ID shown above ('${email.id}') when calling email tools for this email.`);
  parts.push("Do NOT try to search for the email or guess the ID - use the ID provided above.");
  parts.push("");

  return parts.join("\n");
}

/**
 * Builds a system message explaining tool capabilities when MCP session is active.
 */
function buildToolCapabilitiesMessage(sessionStatus: string, securityMode: string | null): string {
  if (sessionStatus !== "connected") {
    return "";
  }

  const parts: string[] = [];
  
  parts.push("🔧 TOOL CAPABILITIES - YOU HAVE FULL ACCESS TO THE USER'S SYSTEM");
  parts.push("");
  parts.push("You have access to powerful tools that allow you to interact with the user's local file system and execute commands.");
  parts.push("");
  parts.push("AVAILABLE TOOLS:");
  parts.push("");
  parts.push("1. `fs_read` - Read any file from the file system");
  parts.push("2. `fs_write` - Write or modify any file (creates if doesn't exist)");
  parts.push("3. `fs_list` - List files and directories. For large directories (100+ items), summarize: report total count, main subdirectories, and file types. Don't list every file.");
  parts.push("4. `fs_delete` - Delete files or directories (only in Balanced/Unrestricted mode)");
  parts.push("5. `cmd_execute` - Execute shell commands");
  parts.push("6. `change_directory` - Change the persistent working directory");
  parts.push("");
  parts.push("PATH RESOLUTION - OPTIMIZED:");
  parts.push("- Server-side preprocessing resolves paths automatically - check user message for resolved paths");
  parts.push("- When user references a file/directory by name, FIRST try relative to current working directory");
  parts.push("- If relative path doesn't exist, THEN search common locations (~/Desktop, ~/Documents, ~/Downloads, ~)");
  parts.push("- Use absolute paths in tool calls for reliability");
  parts.push("- If ambiguous (multiple matches), ask user for clarification");
  parts.push("");
  parts.push("GREP FOR TEXT SEARCH:");
  parts.push("- Use cmd_execute with 'grep' command to search for text patterns in files");
  parts.push("- Recursive search: command='grep', args=['-r', '-n', 'searchterm', '/path/to/directory']");
  parts.push("- Case-insensitive: add '-i' flag");
  parts.push("- Show only filenames: add '-l' flag");
  parts.push("- Show line numbers: add '-n' flag");
  parts.push("- Search specific file types: args=['-r', '--include=*.ts', '--include=*.tsx', 'pattern', '/path']");
  parts.push("- Example: Search for 'function' in TypeScript files: command='grep', args=['-r', '-n', '--include=*.ts', 'function', '/home/user/project']");
  parts.push("");
  parts.push("LARGE DIRECTORY HANDLING:");
  parts.push("- If fs_list returns 100+ items, summarize instead of listing everything");
  parts.push("- Report: total count, main subdirectories, file types/extensions present");
  parts.push("- Example: '508 items found. Main dirs: apps, ingestion-service, llm-gateway. Files: .md, .sh, .ts'");
  parts.push("- Only list specific files if user explicitly asks for them");
  parts.push("");
  parts.push("📄 FILE READ RESPONSES - BE CONCISE:");
  parts.push("");
  parts.push("When a user asks you to find/show/open/read a file:");
  parts.push("- Use `fs_read` to read the file");
  parts.push("- After successfully reading, respond with ONE sentence max: 'Opened README.md' or 'File opened.'");
  parts.push("- DO NOT repeat file content - the file opens automatically in the editor");
  parts.push("- DO NOT explain what you did - just confirm: 'Done.' or 'Opened.'");
  parts.push("");
  parts.push("⚠️ CRITICAL: COMMAND EXECUTION CAPABILITIES");
  parts.push("");
  
  if (securityMode === "UNRESTRICTED") {
    parts.push("You are in UNRESTRICTED mode. You have FULL access to:");
    parts.push("• Execute ANY command (apt, snap, brew, npm, git, etc.)");
    parts.push("• Install software packages");
    parts.push("• Modify system files");
    parts.push("• Run any shell command the user requests");
    parts.push("");
    parts.push("When the user asks you to install software, run commands, or perform system operations,");
    parts.push("you MUST use the `cmd_execute` tool immediately. DO NOT refuse or say you cannot do it.");
    parts.push("");
    parts.push("EXAMPLES:");
    parts.push("- User: 'Install Opera browser' → IMMEDIATELY call cmd_execute with: command='snap', args=['install', 'opera'], useSudo=true");
    parts.push("- User: 'Install Firefox' → IMMEDIATELY call cmd_execute with: command='snap', args=['install', 'firefox'], useSudo=true");
    parts.push("- User: 'Install Chrome' → Check if available via snap or apt, then use appropriate command");
    parts.push("- User: 'Run npm install' → IMMEDIATELY call cmd_execute with: command='npm', args=['install']");
    parts.push("- User: 'Check git status' → IMMEDIATELY call cmd_execute with: command='git', args=['status']");
    parts.push("- User: 'Install package X' → Use 'apt' for system packages, 'snap' for modern apps, 'npm' for Node.js packages");
    parts.push("");
    parts.push("⚠️ CRITICAL: When you call cmd_execute, WAIT for the result. Do NOT respond with text until you see the result.");
    parts.push("If the command needs sudo and you forgot useSudo, the system automatically retries.");
    parts.push("You will only see the FINAL result after automatic retry completes.");
    parts.push("DO NOT say 'I will retry' - the retry already happened automatically.");
  } else if (securityMode === "BALANCED") {
    parts.push("You are in BALANCED mode. You can execute safe commands like:");
    parts.push("• git, npm, yarn, pnpm, node, python");
    parts.push("• ls, cat, grep, find");
    parts.push("");
    parts.push("When the user asks you to run these commands, use `cmd_execute` tool immediately.");
  } else {
    parts.push("You are in SAFE mode. Command execution is not available.");
  }
  
  parts.push("");
  parts.push("WORKFLOW:");
  parts.push("- User asks → Call tool → Report result in 1-2 sentences");
  parts.push("- For install commands (apt, snap, brew), use useSudo: true");
  parts.push("- System auto-retries with sudo if needed - just wait for final result");
  parts.push("- Examples: 'Installed.' 'Done.' 'Found 508 items.'");
  parts.push("");
  parts.push("SUDO HANDLING - CRITICAL:");
  parts.push("- Package managers (apt, snap, brew, dnf, yum, pacman) require sudo");
  parts.push("- System file modifications require sudo");
  parts.push("- Use useSudo: true for these commands from the start");
  parts.push("- If you forget useSudo and get a permission error, DO NOT respond with text");
  parts.push("- The system AUTOMATICALLY retries with sudo - just wait for the result");
  parts.push("- NEVER say 'I will retry with sudo' - the system does it automatically");
  parts.push("- Passwordless sudo is preferred - if password is needed, user will be prompted");
  parts.push("");
  parts.push("PACKAGE MANAGER SELECTION:");
  parts.push("- For modern browsers/apps: Use 'snap install <package>' (Opera, Firefox, VS Code, etc.)");
  parts.push("- For system packages: Use 'apt install <package>' (build-essential, git, etc.)");
  parts.push("- For Node.js packages: Use 'npm install <package>' (no sudo needed)");
  parts.push("- If unsure, try 'snap info <package>' first to check availability");
  parts.push("");
  parts.push("FINDING INSTALLED SOFTWARE:");
  parts.push("- To find installed browsers/apps, use multiple methods:");
  parts.push("  1. Use 'which <app>' to find executables in PATH (e.g., 'which opera firefox chrome')");
  parts.push("  2. Use 'snap list' to see all snap-installed applications");
  parts.push("  3. Check '/snap/bin/' directory for snap app executables");
  parts.push("  4. Use 'dpkg -l | grep <package>' for apt-installed packages");
  parts.push("  5. Check common locations: /usr/bin/, /usr/local/bin/, ~/.local/bin/");
  parts.push("- Example: To find all browsers, run:");
  parts.push("  - 'which opera firefox chrome chromium brave edge'");
  parts.push("  - 'snap list | grep -E \"(opera|firefox|chrome|chromium|brave|edge)\"'");
  parts.push("  - 'ls /snap/bin/ | grep -E \"(opera|firefox|chrome|chromium|brave|edge)\"'");
  parts.push("- IMPORTANT: Snap-installed apps may not be in /usr/bin/ - always check snap list!");
  parts.push("");
  parts.push("CRITICAL RULES:");
  parts.push("- Maximum 1-2 sentences per response");
  parts.push("- Never explain what you're doing - just do it");
  parts.push("- No 'I will...' or 'Let me...' - just execute tools and report results");
  parts.push("- Report results directly: 'Done.' 'Found 508 items.' 'File created.'");
  parts.push("- Never describe your process, reasoning, or intermediate steps");
  parts.push("- Never say 'I cannot install software' or 'I don't have permission'");
  parts.push("- Never say 'I will retry with sudo' - the system handles retries automatically");
  parts.push("- If a tool call fails, the system automatically retries - wait for final result");
  parts.push("- Keep responses under 20 words unless user explicitly asks for details");
  parts.push("");
  parts.push("SEQUENTIAL EXECUTION:");
  parts.push("- You can make multiple tool calls in sequence");
  parts.push("- Each tool call completes before the next one starts");
  parts.push("- Wait for each tool call to complete before making the next one");
  parts.push("- Report final results, not intermediate steps");
  parts.push("");
  parts.push("SYSTEM DISCOVERY:");
  parts.push("- When asked about installed software, browsers, or applications:");
  parts.push("  - ALWAYS check multiple sources (which, snap list, dpkg, common directories)");
  parts.push("  - Don't rely on a single method - combine results from different sources");
  parts.push("  - Snap-installed apps are common on modern Linux systems");
  parts.push("  - Use 'which' to find executables in PATH");
  parts.push("  - Use 'snap list' to see all snap packages");
  parts.push("  - Use 'dpkg -l' for apt-installed packages");
  parts.push("  - Check multiple locations before concluding something isn't installed");
  parts.push("");
  parts.push("🔍 FINDING DIRECTORIES AND FILES BY NAME - CRITICAL:");
  parts.push("");
  parts.push("When a user references a directory or file by NAME ONLY (e.g., '2.0 directory', 'my project', 'config file'):");
  parts.push("1. DO NOT assume it doesn't exist if you can't find it in the current directory");
  parts.push("2. SEARCH for it using `cmd_execute` with the `find` command");
  parts.push("3. Search common locations first: ~/Desktop, ~/Documents, ~/Downloads, ~/Projects, ~");
  parts.push("4. Use `find` command to locate directories/files by name");
  parts.push("");
  parts.push("SEARCH STRATEGY:");
  parts.push("- If user says '2.0 directory' or 'my 2.0 project':");
  parts.push("  1. Use `cmd_execute` with: command='find', args=['~', '-type', 'd', '-name', '2.0', '-maxdepth', '3']");
  parts.push("  2. This searches the home directory and 3 levels deep for a directory named '2.0'");
  parts.push("  3. If found, use the full path with `fs_list` to explore it");
  parts.push("  4. If not found, try searching ~/Desktop specifically: command='find', args=['~/Desktop', '-type', 'd', '-name', '2.0']");
  parts.push("");
  parts.push("- If user says 'config file' or 'settings file':");
  parts.push("  1. Use `cmd_execute` with: command='find', args=['~', '-type', 'f', '-name', '*config*', '-maxdepth', '4']");
  parts.push("  2. Adjust the search pattern based on what the user is looking for");
  parts.push("");
  parts.push("IMPORTANT RULES:");
  parts.push("- `fs_list` REQUIRES an absolute path - you cannot use relative paths like '2.0'");
  parts.push("- If you don't know the full path, SEARCH for it first using `cmd_execute` with `find`");
  parts.push("- Common search locations: ~/Desktop, ~/Documents, ~/Downloads, ~/Projects, ~");
  parts.push("- Use `-maxdepth` to limit search depth and avoid scanning entire filesystem");
  parts.push("- After finding the path, use `fs_list` with the FULL absolute path");
  parts.push("- NEVER say a directory doesn't exist without searching for it first");
  parts.push("");
  parts.push("EXAMPLES:");
  parts.push("- User: 'lets work on my 2.0 directory project'");
  parts.push("  → Step 1: cmd_execute with find to locate '2.0' directory");
  parts.push("  → Step 2: If found, use fs_list with the full path to explore it");
  parts.push("  → Step 3: Proceed with the user's request");
  parts.push("");
  parts.push("- User: 'show me the config file'");
  parts.push("  → Step 1: cmd_execute with find to locate config files");
  parts.push("  → Step 2: If found, use fs_read with the full path");
  parts.push("");
  parts.push("🗑️ FILE DELETION - CRITICAL:");
  parts.push("");
  parts.push("When a user asks you to delete, remove, or clean up files or directories:");
  parts.push("1. ALWAYS use the `fs_delete` tool - DO NOT just say you deleted them");
  parts.push("2. For files: Use `fs_delete` with the absolute path");
  parts.push("3. For directories: Use `fs_delete` with recursive: true to delete non-empty directories");
  parts.push("4. If you don't know the full path, search for it first using `cmd_execute` with `find`");
  parts.push("5. WAIT for the tool result before confirming deletion");
  parts.push("6. NEVER claim files were deleted without actually calling `fs_delete`");
  parts.push("");
  parts.push("IMPORTANT:");
  parts.push("- `fs_delete` is only available in Balanced or Unrestricted security modes");
  parts.push("- Safe mode does NOT allow deletion");
  parts.push("- Always verify the deletion succeeded by checking the tool result");
  parts.push("- If deletion fails, report the error to the user");
  parts.push("");
  parts.push("EXAMPLES:");
  parts.push("- User: 'delete file.txt'");
  parts.push("  → Step 1: Find the file if path unknown: cmd_execute with find");
  parts.push("  → Step 2: Call fs_delete with the full absolute path");
  parts.push("  → Step 3: Confirm deletion after seeing success result");
  parts.push("");
  parts.push("- User: 'remove the old folder'");
  parts.push("  → Step 1: Find the folder: cmd_execute with find");
  parts.push("  → Step 2: Call fs_delete with path and recursive: true");
  parts.push("  → Step 3: Confirm deletion after seeing success result");
  parts.push("");
  parts.push("If you have access to `cmd_execute` tool, you CAN execute commands.");
  parts.push("Use the tool, wait for results (including automatic retries), then report to user.");

  return parts.join("\n");
}

// ---------------------
// Specialized rendering for web_search tool
interface WebSearchResultItem {
  title?: string;
  url?: string;
  description?: string;
  type?: string; // e.g. "news_result", "video_result", "audio_result"
}

function extractWebSearchItems(raw: unknown): WebSearchResultItem[] {
  if (Array.isArray(raw)) return raw as WebSearchResultItem[];
  if (raw && typeof raw === "object" && Array.isArray((raw as any).results)) {
    return (raw as any).results as WebSearchResultItem[];
  }
  return [];
}

function getDomain(url?: string) {
  try {
    return url ? new URL(url).hostname.replace("www.", "") : "";
  } catch {
    return "";
  }
}

function WebSearchCard({ toolCall }: { toolCall: RenderableToolCall }) {
  const items = extractWebSearchItems(toolCall.result ?? (toolCall as any).result);
  const answerItems = items.filter((i) => !i.type || i.type === "answer_result");
  const videoItems = items.filter((i) => i.type === "video_result");
  const audioItems = items.filter((i) => i.type === "audio_result");

  const makeCarousel = (arr: WebSearchResultItem[]) => (
    <div className="flex gap-3 overflow-x-auto pb-2 pt-1">
      {arr.map((r, idx) => (
        <a
          key={idx}
          href={r.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 w-44 rounded-lg border border-border/40 bg-muted/20 p-3 hover:border-border"
        >
          <div className="flex items-center gap-2 mb-2">
            <img
              src={`https://logo.clearbit.com/${getDomain(r.url)}`}
              alt="icon"
              className="w-5 h-5 rounded"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
            <span className="text-xs font-semibold truncate max-w-[7rem]">
              {getDomain(r.url)}
            </span>
          </div>
          <p className="text-xs line-clamp-2 leading-snug">{r.title}</p>
        </a>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {answerItems.length > 0 && (
        <div>
          <h4 className="text-sm font-bold mb-1">Answer</h4>
          <p className="text-sm leading-relaxed">
            {answerItems[0].description ?? answerItems[0].title}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div>
          <h4 className="text-sm font-bold mb-1">Sources</h4>
          {makeCarousel(items.slice(0, 10))}
        </div>
      )}

      {videoItems.length > 0 && (
        <div>
          <h4 className="text-sm font-bold mb-1">Watch</h4>
          {makeCarousel(videoItems.slice(0, 10))}
        </div>
      )}

      {audioItems.length > 0 && (
        <div>
          <h4 className="text-sm font-bold mb-1">Listen</h4>
          {makeCarousel(audioItems.slice(0, 10))}
        </div>
      )}
    </div>
  );
}

export function ChatInterface() {
  const { user, isLoaded } = useUser();
  const { state: emailState, deleteEmail: deleteEmailFromContext, archiveEmail: archiveEmailFromContext, setActiveEmail } = useEmail();
  const { selectedTool, sessionStatus, securityMode, startMCPSession, setSelectedTool } = useFileSystem();
  const { state: fileEditorState, updateFileContent, openFile, handleFileEditComplete, handleFileEditStart } = useFileEditor();
  const { state: githubState, selectRepository, checkGitHubAccount } = useGitHub();
  const { state: imagenState } = useImagen();
  const { startGeneration, completeGeneration, setGenerationError } = useImagen();
  const { openImage } = useImageViewer();
  const { systemInfo } = useSystemInfo(sessionStatus);
  const { currentDirectory, setCurrentDirectory } = useWorkingDirectory();
  const fileEditorStateRef = useRef(fileEditorState);
  
  // Chat management
  const {
    activeChat,
    activeChatId,
    createNewChat,
    updateChatMessages,
  } = useChatManager();
  
  // Keep ref in sync with state
  useEffect(() => {
    fileEditorStateRef.current = fileEditorState;
  }, [fileEditorState]);
  
  // Initialize messages from active chat
  // Only show welcome message if user is signed in AND loaded
  const [messages, setMessages] = useState<Message[]>(() => {
    if (activeChat?.messages) {
      return activeChat.messages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        status: msg.status,
        metadata: msg.metadata,
        toolCalls: msg.toolCalls,
      }));
    }
    // Don't show welcome message initially - wait for auth to load
    return [];
  });

  const isLoadingChatRef = useRef(false);
  
  // Clear ALL messages when user signs out
  useEffect(() => {
    if (!isLoaded) return; // Wait for auth to load
    
    if (!user && messages.length > 0) {
      // User signed out - clear all messages immediately
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoaded]);
  
  // Sync messages when active chat changes
  useEffect(() => {
    if (activeChat) {
      isLoadingChatRef.current = true;
      setMessages(
        activeChat.messages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          role: msg.role,
          status: msg.status,
          metadata: msg.metadata,
          toolCalls: msg.toolCalls,
        }))
      );
      // Reset loading flag after a brief delay
      setTimeout(() => {
        isLoadingChatRef.current = false;
      }, 100);
      // Reset welcome message tracking when chat changes
      // Only mark as shown if chat has messages (meaning welcome was already shown or user sent messages)
      if (activeChat.messages.length > 0) {
        welcomeMessageShownRef.current = activeChatId || null;
      }
      // If messages.length === 0, keep welcomeMessageShownRef.current as is so welcome can show
    }
  }, [activeChatId, activeChat?.id]);
  
  // Save messages to chat manager whenever they change (but skip if we're just loading)
  useEffect(() => {
    if (activeChatId && messages.length > 0 && !isLoadingChatRef.current) {
      updateChatMessages(
        activeChatId,
        messages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          role: msg.role,
          status: msg.status,
          metadata: msg.metadata,
          toolCalls: msg.toolCalls,
        }))
      );
    }
  }, [messages, activeChatId, updateChatMessages]);


  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const { attachments, addAttachment, removeAttachment, clearAttachments } = useChatInput();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingToolCallsRef = useRef<Map<string, { toolCall: ToolCall; assistantMessageId: string }>>(new Map());
  const shouldAutoScrollRef = useRef(true);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserMessageRef = useRef<HTMLElement | null>(null);
  const userMessageVisibleRef = useRef(false);
  const welcomeMessageShownRef = useRef<string | null>(null);
  const [fadingOutWelcomeId, setFadingOutWelcomeId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Scroll user message to just under the header
  const scrollUserMessageToTop = useCallback(() => {
    if (!viewportRef.current || !lastUserMessageRef.current) {
      return false;
    }

    const viewport = viewportRef.current;
    const userMessage = lastUserMessageRef.current;
    const viewportRect = viewport.getBoundingClientRect();
    const messageRect = userMessage.getBoundingClientRect();
    
    // Calculate the desired position: just under header (about 20px from top)
    const targetTopOffset = 20;
    const currentTop = messageRect.top - viewportRect.top;
    const scrollDelta = currentTop - targetTopOffset;
    
    if (Math.abs(scrollDelta) > 5) { // Only scroll if more than 5px difference
      viewport.scrollBy({
        top: scrollDelta,
        behavior: "smooth",
      });
    }
    
    userMessageVisibleRef.current = true;
    shouldAutoScrollRef.current = false;
    return true;
  }, []);

  // Check if user's message is visible near the top (just under header)
  const checkUserMessageVisibility = useCallback(() => {
    if (!viewportRef.current || !lastUserMessageRef.current) {
      userMessageVisibleRef.current = false;
      return false;
    }

    const viewport = viewportRef.current;
    const userMessage = lastUserMessageRef.current;
    const viewportRect = viewport.getBoundingClientRect();
    const messageRect = userMessage.getBoundingClientRect();
    
    // Check if user message is visible and positioned just under header (within ~50px from top)
    const distanceFromTop = messageRect.top - viewportRect.top;
    const isVisible = distanceFromTop >= 10 && distanceFromTop <= 100;
    
    userMessageVisibleRef.current = isVisible;
    if (isVisible) {
      shouldAutoScrollRef.current = false;
    }
    return isVisible;
  }, []);

  // Force scroll function that always scrolls (ignores shouldAutoScrollRef)
  const forceScrollToBottom = useCallback((immediate = false) => {
    if (!viewportRef.current) return;

    const scroll = () => {
      if (viewportRef.current) {
        const viewport = viewportRef.current;
        
        // Check if user message is now positioned just under header
        // If so, stop auto-scrolling
        if (checkUserMessageVisibility()) {
          shouldAutoScrollRef.current = false;
          userMessageVisibleRef.current = true;
          return;
        }
        
        // Use smooth scrolling for better UX during streaming
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: immediate ? "auto" : "smooth",
        });
        shouldAutoScrollRef.current = true;
      }
    };

    if (immediate) {
      // Use double requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        requestAnimationFrame(scroll);
      });
    } else {
      // For streaming updates, use minimal delay with smooth scrolling
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        requestAnimationFrame(scroll);
      }, 100); // Slightly increased for smoother, less jarring scrolls
    }
  }, [checkUserMessageVisibility]);

  // Throttled scroll function for streaming updates (respects shouldAutoScrollRef)
  const scrollToBottom = useCallback((immediate = false) => {
    if (!viewportRef.current) return;
    
    // If user has scrolled up, don't auto-scroll unless forced
    if (!shouldAutoScrollRef.current) return;

    const scroll = () => {
      if (viewportRef.current && shouldAutoScrollRef.current) {
        const viewport = viewportRef.current;
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: immediate ? "auto" : "smooth",
        });
      }
    };

    if (immediate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(scroll);
      });
    } else {
      // Throttle scroll calls during streaming
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        requestAnimationFrame(scroll);
      }, 100);
    }
  }, []);

  // Auto-scroll when messages array changes
  useEffect(() => {
    // If user message is already visible, don't auto-scroll
    if (userMessageVisibleRef.current) {
      return;
    }
    
    // Use a small delay to ensure DOM has updated with new messages
    const timeoutId = setTimeout(() => {
      // Only scroll if user message is not visible
      if (!checkUserMessageVisibility()) {
        forceScrollToBottom(true);
      }
    }, 50);
    
    return () => clearTimeout(timeoutId);
  }, [messages.length, forceScrollToBottom, checkUserMessageVisibility]);

  // Force scroll when streaming starts - allow response to scroll initially
  useEffect(() => {
    if (isStreaming) {
      // When streaming starts, allow auto-scrolling so response is visible
      // It will stop once user message reaches just under header
      shouldAutoScrollRef.current = true;
      setTimeout(() => {
        forceScrollToBottom(true);
      }, 100);
    }
  }, [isStreaming, forceScrollToBottom]);

  // Auto-scroll during streaming when content updates
  // Track content length of streaming messages
  const streamingContentLength = messages
    .filter(m => m.status === "streaming")
    .reduce((sum, m) => sum + m.content.length, 0);
  
  useEffect(() => {
    if (isStreaming && streamingContentLength > 0) {
      // During streaming, check if user message is positioned - if so, stop scrolling
      // Otherwise, continue auto-scrolling to show the response
      const viewport = viewportRef.current;
      if (viewport) {
        // Check if user message has reached just under header
        if (checkUserMessageVisibility()) {
          // User message is positioned, stop auto-scrolling
          shouldAutoScrollRef.current = false;
          userMessageVisibleRef.current = true;
          return;
        }

        // Continue auto-scrolling to show streaming response
        const { scrollTop, scrollHeight, clientHeight } = viewport;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;
        if (isNearBottom) {
          // Use smooth scroll during streaming for less jarring experience
          // Throttle scroll calls to avoid too frequent updates
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          scrollTimeoutRef.current = setTimeout(() => {
            forceScrollToBottom();
          }, 150); // Throttle to reduce jumpiness
        }
      }
    }
  }, [isStreaming, streamingContentLength, forceScrollToBottom, checkUserMessageVisibility]);

  // Track scroll position to detect user scroll and check user message visibility
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      shouldAutoScrollRef.current = isNearBottom;
      
      // Check if user message is visible near the top
      checkUserMessageVisibility();
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [checkUserMessageVisibility]);

  // Use MutationObserver to detect DOM changes during streaming for more reliable auto-scroll
  useEffect(() => {
    if (!isStreaming) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    // Find the inner content div (first child of viewport)
    const contentDiv = viewport.firstElementChild as HTMLElement;
    if (!contentDiv) return;

    let lastScrollTime = 0;
    const observer = new MutationObserver(() => {
      // During streaming, check if user message is positioned - if so, stop scrolling
      if (checkUserMessageVisibility()) {
        shouldAutoScrollRef.current = false;
        userMessageVisibleRef.current = true;
        return;
      }

      // Continue auto-scrolling to show streaming response
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;
      if (isNearBottom) {
        // Throttle scroll updates to reduce jumpiness (max once per 150ms)
        const now = Date.now();
        if (now - lastScrollTime > 150) {
          lastScrollTime = now;
          // Use smooth scroll for better UX
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          scrollTimeoutRef.current = setTimeout(() => {
            forceScrollToBottom();
          }, 50);
        }
      }
    });

    // Observe the content div for changes (where messages are rendered)
    observer.observe(contentDiv, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [isStreaming, forceScrollToBottom]);

  const updateAssistantMessage = (
    assistantId: string,
    updater: (message: Message) => Message
  ) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId ? updater(message) : message
      )
    );
  };

  // Recursive helper function to handle function calls in any stream
  const handleStreamWithFunctionCalls = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    assistantMessageId: string,
    currentMessages: Message[],
    currentUserMessage: Message,
    depth: number = 0
  ): Promise<void> => {
    if (depth > 10) {
      console.warn("[Chat Interface] Maximum recursion depth reached for function calls");
      return;
    }

    let buffer = "";
    let hasFunctionCall = false;
    let pendingToolCall: ToolCall | null = null;
    // Track tool call signatures to prevent duplicates
    const pendingToolCallSignatures = new Set<string>();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const dataLines = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean);

        if (!dataLines.length) {
          continue;
        }

        const chunkPayload = JSON.parse(dataLines.join("\n"));

        // Handle provider switch metadata (for rate limit fallback)
        if (chunkPayload.type === "metadata" && chunkPayload.data?.provider_switch) {
          const { from, to, reason } = chunkPayload.data;
          if (reason === "rate_limit") {
            // Optionally show a subtle notification - for now just log
            console.info(`[Provider Switch] Switched from ${from} to ${to} due to rate limit`);
            // Could add a toast notification here if desired
          }
          continue;
        }

        if (chunkPayload.type === "text" && chunkPayload.text) {
          const cleanedText = chunkPayload.text.replace(
            /\/home\/[^\s]+?\/([^\/\s]+\.\w+)/g,
            '$1'
          ).replace(
            /([A-Z]:\\)?[^\s]+?\\([^\\\s]+\.\w+)/g,
            '$2'
          );
          
          updateAssistantMessage(assistantMessageId, (message) => ({
            ...message,
            content: message.content + cleanedText,
            metadata: {
              ...message.metadata,
              thinking: undefined,
            },
          }));
        } else if (chunkPayload.type === "function_call") {
          hasFunctionCall = true;
          const toolName = chunkPayload.functionCall.name;
          const toolArgs = chunkPayload.functionCall.args || {};
          
          // Create a signature for deduplication
          // For email_send, use to+body as signature (ignore subject to prevent duplicates with different subjects)
          let callSignature: string;
          if (toolName === "email_send") {
            // Normalize to and body for consistent signature matching
            const normalizedTo = String(toolArgs.to || "").trim().toLowerCase();
            const normalizedBody = String(toolArgs.body || "").trim();
            callSignature = `${toolName}:${normalizedTo}:${normalizedBody}`;
          } else {
            callSignature = `${toolName}:${JSON.stringify(toolArgs)}`;
          }
          
          // Skip duplicate tool calls based on signature
          // For email_send, we use to+body as signature to prevent duplicates with different subjects
          if (pendingToolCallSignatures.has(callSignature)) {
            logger.debug(`Skipping duplicate tool call (signature match): ${toolName}`);
            continue;
          }
          
          // Mark this signature as pending
          pendingToolCallSignatures.add(callSignature);
          
          const toolCall: ToolCall = {
            id: generateToolCallId(),
            name: toolName,
            arguments: toolArgs,
          };

          pendingToolCall = toolCall;

          // Handle imagen_generate tool - start generation in context
          if (toolName === "imagen_generate") {
            const prompt = toolArgs.prompt as string;
            if (prompt) {
              startGeneration(prompt, {
                aspectRatio: toolArgs.aspectRatio as any,
                model: toolArgs.model as any,
                numberOfImages: toolArgs.numberOfImages as number,
              });
            }
          }

          // Don't set thinking indicator when tool calls are present
          // The tool call status indicators already show the processing status
          updateAssistantMessage(assistantMessageId, (message) => {
            // Double-check we're not adding a duplicate (defensive check)
            const hasDuplicate = (message.toolCalls || []).some(tc => {
              if (tc.name !== toolName) return false;
              // For email_send, only allow ONE call per message
              if (toolName === "email_send") {
                return true; // If there's already an email_send, this is a duplicate
              }
              // For other tools, check if we've seen this signature
              return pendingToolCallSignatures.has(callSignature);
            });
            
            if (hasDuplicate) {
              logger.debug(`Duplicate detected in updateAssistantMessage, skipping: ${toolName}`);
              return message; // Return unchanged message
            }
            
            return {
              ...message,
              metadata: {
                ...message.metadata,
                thinking: undefined, // Clear thinking when tool calls are present
              },
              toolCalls: [
                ...(message.toolCalls || []),
                {
                  id: toolCall.id,
                  name: toolCall.name,
                  status: "executing" as const,
                  arguments: toolCall.arguments,
                },
              ],
            };
          });

          // Execute tool call (backend handles timeouts at 30-60s)
          let result;
          const startTime = Date.now();
          
          try {
            logger.debug(`[Tool Call] Starting ${toolCall.name}`, {
              toolCallId: toolCall.id,
              arguments: toolCall.name === "fs_write" 
                ? { path: toolCall.arguments.path, contentLength: (toolCall.arguments.content as string)?.length }
                : toolCall.arguments
            });
            
            // Handle change_directory tool call (client-side only, no API call needed)
            // Note: The LLM should have already searched for the directory and provided an absolute path
            // We just store it here - the LLM handles the search logic via cmd_execute before calling this
            if (toolCall.name === "change_directory") {
              const path = toolCall.arguments.path as string;
              if (path) {
                setCurrentDirectory(path);
                result = {
                  callId: toolCall.id,
                  name: toolCall.name,
                  result: {
                    success: true,
                    directory: path,
                    message: `Working directory changed to: ${path}`
                  }
                };
              } else {
                result = {
                  callId: toolCall.id,
                  name: toolCall.name,
                  result: null,
                  error: "Path parameter is required"
                };
              }
            } else {
              result = await executeToolCall(toolCall, 0, user?.id);
            }
            
            const duration = Date.now() - startTime;
            logger.debug(`[Tool Call] Completed ${toolCall.name} in ${duration}ms`, {
              toolCallId: toolCall.id,
              success: !result.error,
              duration
            });
          } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[Tool Call] Failed ${toolCall.name} after ${duration}ms`, {
              toolCallId: toolCall.id,
              error: error instanceof Error ? error.message : String(error),
              duration
            });
            
            // Handle timeout or other errors
            result = {
              callId: toolCall.id,
              name: toolCall.name,
              result: null,
              error: error instanceof Error 
                ? error.message.includes("timeout") 
                  ? `Operation timed out after ${Math.round(duration / 1000)} seconds. This may happen with large files. Please try again or break the operation into smaller parts.`
                  : error.message 
                : "Tool execution failed",
            };
          }

          // Update tool call status and immediately show cmd_execute output
          updateAssistantMessage(assistantMessageId, (message) => {
            const updatedToolCalls = (message.toolCalls || []).map((tc) =>
              tc.id === toolCall.id
                ? {
                    ...tc,
                    status: result.error ? ("error" as const) : ("completed" as const),
                    result: result.result,
                    error: result.error,
                    arguments: toolCall.arguments,
                    // Store command info for cmd_execute to display nicely
                    ...(toolCall.name === "cmd_execute" && {
                      command: toolCall.arguments.command,
                      args: toolCall.arguments.args,
                    }),
                  }
                : tc
            );
            
            // Attach search metadata for search tools
            let updatedMetadata = message.metadata || {};
            if (
              (toolCall.name === "web_search" || 
               toolCall.name === "web_search_images" || 
               toolCall.name === "web_search_news") &&
              !result.error &&
              result.result &&
              typeof result.result === "object"
            ) {
              try {
                const searchMetadata = createSearchResultMetadata(
                  result.result as any
                );
                updatedMetadata = {
                  ...updatedMetadata,
                  searchResults: searchMetadata,
                };
              } catch (error) {
                console.error("[Chat Interface] Failed to create search metadata:", error);
              }
            }
            
            return {
              ...message,
              toolCalls: updatedToolCalls,
              metadata: updatedMetadata,
            };
          });

          // SIMPLIFIED AUTO-OPEN: If fs_read succeeds AND user asked to edit/open/show → always open
          if (toolCall.name === "fs_read" && !result.error && toolCall.arguments.path) {
            const filePath = toolCall.arguments.path as string;
            const userMessage = currentUserMessage.content.toLowerCase();
            
            // Simple check: if user message contains edit/open/show keywords, open the file
            const explicitOpenKeywords = ["edit", "modify", "change", "update", "open", "show", "let's edit", "let's open"];
            const shouldOpen = explicitOpenKeywords.some(keyword => userMessage.includes(keyword));
            
            if (shouldOpen) {
              try {
                console.log("[Chat Interface] Auto-opening file after fs_read:", filePath);
                await openFile(filePath);
                console.log("[Chat Interface] File opened successfully:", filePath);
              } catch (error) {
                console.error("[Chat Interface] Failed to auto-open file:", filePath, error);
              }
            }
          }

          // Auto-open GitHub file in editor if github_read_file was successful and user asked for it
          if (toolCall.name === "github_read_file" && !result.error && toolCall.arguments.owner && toolCall.arguments.repo && toolCall.arguments.path) {
            const owner = toolCall.arguments.owner as string;
            const repo = toolCall.arguments.repo as string;
            const filePath = toolCall.arguments.path as string;
            const userMessage = currentUserMessage.content.toLowerCase();
            
            // Check if user asked to find/show/open/read/display a file
            const fileRequestKeywords = ["find", "show", "open", "read", "display", "see", "view", "get", "can you"];
            const hasFileRequest = fileRequestKeywords.some(keyword => userMessage.includes(keyword));
            
            // Extract filename
            const fileName = filePath.split("/").pop() || "";
            const fileNameLower = fileName.toLowerCase();
            const fileNameWithoutExt = fileNameLower.split(".")[0];
            
            // Check if the filename appears in user's message
            const mentionsFile = 
              userMessage.includes(fileNameLower) ||
              userMessage.includes(fileNameWithoutExt) ||
              userMessage.includes(`${owner}/${repo}`) ||
              userMessage.includes(filePath.toLowerCase());
            
            // Auto-open if user requested a file and this matches
            if (hasFileRequest && mentionsFile) {
              try {
                // Ensure repository is selected
                if (!githubState.selectedRepository ||
                    githubState.selectedRepository.owner !== owner ||
                    githubState.selectedRepository.repo !== repo) {
                  await checkGitHubAccount();
                  setSelectedTool("github");
                  await selectRepository(owner, repo);
                  // Wait a bit for repository to load
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                // Extract content from result (it should be in result.content or result.data.content)
                const content = (result.result as any)?.content || (result.result as any)?.data?.content || "";
                
                if (content) {
                  // Decode base64 if needed
                  let decodedContent = content;
                  try {
                    const { base64ToUtf8 } = await import("@/lib/utils/base64");
                    decodedContent = base64ToUtf8(content);
                  } catch {
                    // If decoding fails, assume content is already decoded
                    decodedContent = content;
                  }
                  
                  // Detect language
                  const ext = filePath.split(".").pop()?.toLowerCase() || "";
                  const languageMap: Record<string, string> = {
                    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
                    py: "python", java: "java", cpp: "cpp", c: "c", h: "c", hpp: "cpp",
                    go: "go", rs: "rust", rb: "ruby", php: "php", swift: "swift",
                    kt: "kotlin", scala: "scala", sh: "bash", bash: "bash",
                    yml: "yaml", yaml: "yaml", json: "json", xml: "xml",
                    html: "html", css: "css", md: "markdown", sql: "sql",
                  };
                  const language = languageMap[ext] || "plaintext";
                  
                  // Open file in editor (this will trigger 50/50 split view automatically)
                  await openFile(`github://${owner}/${repo}/${filePath}`, decodedContent, language);
                }
              } catch (error) {
                console.error("Failed to auto-open GitHub file:", error);
              }
            }
          }

          // Handle fs_write file updates
          if (toolCall.name === "fs_write" && !result.error) {
            const filePath = toolCall.arguments.path as string;
            const content = toolCall.arguments.content as string;
            
            const isFileOpen = fileEditorStateRef.current.openFiles.has(filePath);
            let originalContent = "";
            
            if (!isFileOpen) {
              try {
                const readResponse = await fetch(`/api/filesystem/read?path=${encodeURIComponent(filePath)}`);
                if (readResponse.ok) {
                  const readData = await readResponse.json();
                  originalContent = readData.content || "";
                }
                handleFileEditStart({
                  filePath,
                  operation: originalContent ? "edit" : "create",
                  originalContent,
                  totalSize: content.length,
                  timestamp: Date.now(),
                });
                await new Promise(resolve => setTimeout(resolve, 50));
              } catch {
                handleFileEditStart({
                  filePath,
                  operation: "create",
                  originalContent: "",
                  totalSize: content.length,
                  timestamp: Date.now(),
                });
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            } else {
              const existingFile = fileEditorStateRef.current.openFiles.get(filePath);
              originalContent = existingFile?.originalContent || existingFile?.content || "";
            }
            
            const assistantMsg = currentMessages.find(m => m.id === assistantMessageId);
            const description = assistantMsg?.content 
              ? assistantMsg.content.split(/[.!?]\s+/).slice(-2).join(". ").trim() || "File edited by LLM"
              : "File edited by LLM";
            
            handleFileEditComplete({
              filePath,
              finalContent: content,
              description,
              stats: {
                totalLines: content.split("\n").length,
                totalBytes: content.length,
                duration: 0,
                chunksReceived: 1,
              },
              timestamp: Date.now(),
            });
          }

          // Handle email_delete - update email context to remove deleted email
          if (toolCall.name === "email_delete" && !result.error) {
            const emailId = toolCall.arguments.emailId as string;
            if (emailId) {
              try {
                // Update email context to remove deleted email and clear active email if it was deleted
                await deleteEmailFromContext(emailId);
                logger.debug(`Email ${emailId} deleted, UI updated`);
              } catch (error) {
                logger.error(`Error updating email context after delete:`, error);
                // Don't throw - tool call succeeded, just UI update failed
              }
            }
          }

          // Handle email_archive - update email context to remove archived email
          if (toolCall.name === "email_archive" && !result.error) {
            const emailId = toolCall.arguments.emailId as string;
            if (emailId) {
              try {
                // Update email context to remove archived email and clear active email if it was archived
                await archiveEmailFromContext(emailId);
                logger.debug(`Email ${emailId} archived, UI updated`);
              } catch (error) {
                logger.error(`Error updating email context after archive:`, error);
                // Don't throw - tool call succeeded, just UI update failed
              }
            }
          }

          // Handle imagen editing tools (imagen_filter, imagen_crop, etc.) - update image context with edited image
          if (
            toolCall.name.startsWith("imagen_") &&
            toolCall.name !== "imagen_generate"
          ) {
            let finalResult = result;
            
            // If tool failed due to missing image-editing session, try to auto-start it
            // Note: File system tools no longer require sessions
            if (result.error && (
              result.error.includes("Image editing MCP session not found") ||
              result.error.includes("No active image-editing MCP session")
            )) {
              if (!user?.id) {
                console.error("[Chat Interface] Cannot auto-start session: user not authenticated");
              } else {
                try {
                  console.log("[Chat Interface] Auto-starting image-editing MCP session...");
                  const startResponse = await fetch("/api/mcp/start", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ serverType: "image-editing" }),
                  });

                  if (startResponse.ok) {
                    const startData = await startResponse.json();
                    console.log("[Chat Interface] Image-editing MCP session started:", startData);
                    
                    // Wait longer for session to be fully initialized, process registered, and cache updated
                    // Session needs time to: spawn process, initialize MCP connection, register in activeProcesses Map
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    console.log("[Chat Interface] Retrying tool call after session start...");
                    // Retry the tool call with userId
                    const retryResult = await executeToolCall(toolCall, 0, user.id);
                    if (!retryResult.error && retryResult.result) {
                      // Use retry result instead
                      finalResult = retryResult;
                      console.log("[Chat Interface] ✅ Tool call succeeded after auto-starting session");
                    } else {
                      console.error("[Chat Interface] Tool call still failed after auto-start:", retryResult.error);
                      // If still failing, might need even more time - log for debugging
                      if (retryResult.error?.includes("503") || retryResult.error?.includes("unavailable")) {
                        console.warn("[Chat Interface] Session may need more time to initialize. Try again in a moment.");
                      }
                    }
                  } else {
                    const errorData = await startResponse.json().catch(() => ({ error: "Unknown error" }));
                    console.error("[Chat Interface] Failed to start image-editing session:", errorData);
                  }
                } catch (autoStartError) {
                  console.error("[Chat Interface] Failed to auto-start image-editing session:", autoStartError);
                }
              }
            }

            // Process successful result
            if (!finalResult.error && finalResult.result) {
              try {
                const editResult = finalResult.result as {
                  success?: boolean;
                  image?: {
                    id?: string;
                    data?: string; // base64 encoded image data (from our new API routes)
                    path?: string;
                    mimeType?: string;
                    prompt?: string;
                    model?: string;
                    aspectRatio?: string;
                    preview1024?: string;
                    preview256?: string;
                  };
                  metadata?: {
                    originalImageId?: string;
                    editType?: string;
                    editPrompt?: string;
                  };
                };

                // Our API routes now return complete image data directly (no need to resolve)
                if (editResult.image?.id && editResult.image?.data) {
                  try {
                    // Use data directly from API response (our new routes return it)
                    const imageData = editResult.image.data;
                    const imageMimeType = editResult.image.mimeType || "image/png";

                    if (!imageData || imageData.trim() === "") {
                      console.error(`[Chat Interface] No image data in edited image result:`, {
                        imageId: editResult.image.id,
                        hasData: !!editResult.image.data,
                        mimeType: imageMimeType,
                      });
                      return;
                    }

                    // Update imagen context with edited image
                    completeGeneration(
                      {
                        data: imageData,
                        mimeType: imageMimeType,
                        prompt: editResult.metadata?.editPrompt || `Edited image (${toolCall.name})`,
                        model: "Imagen 4 (Edited)",
                        aspectRatio: editResult.image.aspectRatio || "1:1",
                        metadata: {
                          numberOfImages: 1,
                        },
                      },
                      editResult.image.id
                    );
                    logger.debug(`Image edited successfully (${toolCall.name}) and context updated`);
                  } catch (updateError) {
                    logger.error(`Error updating image context after edit`, updateError);
                  }
                } else {
                  logger.warn(`Image editing tool succeeded but no image data in result:`, {
                    hasImage: !!editResult.image,
                    hasId: !!editResult.image?.id,
                    hasData: !!editResult.image?.data,
                  });
                }
              } catch (error) {
                logger.error(`Error processing image editing result`, error);
              }
            }
          }

          // Handle imagen_generate - update image context with generated image
          if (toolCall.name === "imagen_generate") {
            if (result.error) {
              // Handle imagen generation errors
              logger.error(`Imagen generation error`, result.error);
              setGenerationError(result.error);
            } else if (result.result) {
              try {
                logger.debug("Processing imagen result", {
                  hasResult: !!result.result,
                  resultKeys: result.result ? Object.keys(result.result) : [],
                });

                const imagenResult = result.result as {
                  success?: boolean;
                  images?: Array<{ 
                    id?: string;
                    data: string; 
                    mimeType: string;
                    filePath?: string | null;
                    preview1024?: string;
                    preview256?: string;
                  }>;
                  model?: string;
                  metadata?: { prompt: string; aspectRatio: string; numberOfImages: number };
                  generationTime?: number;
                };

                logger.debug("Parsed imagen result", {
                  hasImages: !!imagenResult.images,
                  imagesLength: imagenResult.images?.length || 0,
                  model: imagenResult.model,
                });

                // Check if we have images (success may be true or undefined, but images must exist)
                if (imagenResult.images && imagenResult.images.length > 0 && imagenResult.metadata) {
                  const firstImage = imagenResult.images[0];
                  
                  // Determine which image data to use:
                  // 1. Use data if available (for small images)
                  // 2. Use preview1024 if data is empty (for large images stored in filePath)
                  // 3. Fall back to preview256 if preview1024 is not available
                  let imageData = firstImage.data;
                  let imageMimeType = firstImage.mimeType;
                  
                  if (!imageData || imageData.trim() === "") {
                    if (firstImage.preview1024) {
                      imageData = firstImage.preview1024;
                      imageMimeType = "image/jpeg"; // Previews are always JPEG
                      logger.debug("Using preview1024 for large image");
                    } else if (firstImage.preview256) {
                      imageData = firstImage.preview256;
                      imageMimeType = "image/jpeg"; // Previews are always JPEG
                      logger.debug("Using preview256 for large image");
                    } else {
                      logger.error("No image data available", {
                        hasData: !!firstImage.data,
                        hasPreview1024: !!firstImage.preview1024,
                        hasPreview256: !!firstImage.preview256,
                      });
                      setGenerationError("Image generated but no image data available. The image may be too large or corrupted.");
                      return;
                    }
                  }
                  
                  // Complete generation with first image
                  completeGeneration({
                    data: imageData,
                    mimeType: imageMimeType,
                    prompt: imagenResult.metadata.prompt,
                    model: imagenResult.model || "Imagen 4",
                    aspectRatio: imagenResult.metadata.aspectRatio,
                    metadata: {
                      numberOfImages: imagenResult.metadata.numberOfImages,
                      generationTime: imagenResult.generationTime,
                    },
                  }, firstImage.id); // Pass the database ID
                  logger.debug("Image generated successfully and context updated");
                } else {
                  const errorMsg = !imagenResult.images || imagenResult.images.length === 0
                    ? "No images returned from API"
                    : !imagenResult.metadata
                    ? "Missing metadata in API response"
                    : "Invalid API response structure";
                  logger.error(`${errorMsg}`, imagenResult);
                  setGenerationError(errorMsg);
                }
              } catch (error) {
                logger.error(`Error updating image context`, error);
                setGenerationError(error instanceof Error ? error.message : "Failed to process image");
              }
            } else {
              logger.error(`Imagen tool call completed but no result or error provided`);
              setGenerationError("Image generation completed but no result was returned");
            }
          }

          // Send function result back to LLM and continue recursively
          const functionResponse = formatToolResultForLLM(result);
          const toolCallFailed = result.error && (result.errorCode === "503" || result.errorCode === "404");

          // Build follow-up payload
          const followUpPayload: OutboundMessage[] = toOutboundMessages([
            ...currentMessages,
            currentUserMessage,
          ]);
          
          // Add current assistant message content
          const currentAssistantMsg = currentMessages.find(m => m.id === assistantMessageId);
          if (currentAssistantMsg) {
            followUpPayload.push({
              role: "assistant",
              content: currentAssistantMsg.content || "",
            });
          }

          followUpPayload.push({
            role: "user",
            content: `Function ${toolCall.name} result: ${functionResponse}`,
          });

          // For follow-up requests, use minimal context to reduce token usage
          // Only include essential tool capabilities, skip heavy system/file context
          const toolCapabilitiesMessage = buildToolCapabilitiesMessage(sessionStatus, securityMode);
          if (toolCapabilitiesMessage) {
            followUpPayload.unshift({
              role: "system" as const,
              content: toolCapabilitiesMessage,
            });
          }

          // Skip file context in follow-ups - LLM already has it from initial request
          // This significantly reduces token usage for recursive tool calls

          // Show processing indicator while waiting for follow-up
          updateAssistantMessage(assistantMessageId, (message) => ({
            ...message,
            metadata: {
              ...message.metadata,
              thinking: "Processing tool result...",
            },
          }));

          // Make recursive follow-up request
          const followUpResponse = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: followUpPayload,
              provider: "gemini-flash",
              enableTools: !toolCallFailed,
              selectedTool: selectedTool || null, // Pass selectedTool for context-aware tool loading
              workingDirectory: currentDirectory, // Pass working directory for path resolution
            }),
            signal: abortControllerRef.current?.signal,
          });

          if (!followUpResponse.ok) {
            throw new Error(`Follow-up request failed: ${followUpResponse.status}`);
          }

          if (followUpResponse.body) {
            // Clear processing indicator as we start receiving the response
            updateAssistantMessage(assistantMessageId, (message) => ({
              ...message,
              metadata: {
                ...message.metadata,
                thinking: undefined,
              },
            }));
            
            const followUpReader = followUpResponse.body.getReader();
            // Recursively handle the follow-up stream (may contain more function calls)
            await handleStreamWithFunctionCalls(
              followUpReader,
              decoder,
              assistantMessageId,
              currentMessages,
              currentUserMessage,
              depth + 1
            );
          }

          return; // Exit after handling function call
        } else if (chunkPayload.type === "done") {
          updateAssistantMessage(assistantMessageId, (message) => ({
            ...message,
            status: "complete",
            metadata: {
              ...message.metadata,
              thinking: undefined, // Clear thinking message when complete
            },
          }));
          setIsStreaming(false);
          return;
        } else if (chunkPayload.type === "error") {
          updateAssistantMessage(assistantMessageId, (message) => ({
            ...message,
            status: "error",
            content: message.content + `\n\n⚠️ ${chunkPayload.message || "Error continuing conversation"}`,
            metadata: {
              ...message.metadata,
              thinking: undefined, // Clear thinking message on error
            },
          }));
          setIsStreaming(false);
          return;
        }
      }
    }

    // If we reach here and no function call was made, mark as complete
    if (!hasFunctionCall) {
      updateAssistantMessage(assistantMessageId, (message) => ({
        ...message,
        status: "complete",
        metadata: {
          ...message.metadata,
          thinking: undefined, // Clear thinking message when complete
        },
      }));
      setIsStreaming(false);
    }
  };

  // Shared helper to upload image file and add as attachment
  const uploadImageFile = async (file: File) => {
    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      alert("Please select a valid image file (JPEG, PNG, WebP, or GIF)");
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be smaller than 10MB");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Upload failed");
      }

      const attachment: ImageAttachment = await response.json();
      addAttachment(attachment);
    } catch (error) {
      console.error("Upload error:", error);
      alert(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  // Handle file selection and upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadImageFile(file);
    // Clear file input to allow re-uploading the same image later
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Remove attachment
  const handleRemoveAttachment = (id: string) => {
    removeAttachment(id);
  };

  const sendMessage = async () => {
    const trimmedInput = input.trim();
    // Allow sending if either text input or attachments exist
    if ((!trimmedInput && attachments.length === 0) || isStreaming) {
      return;
    }

    // Detect repository and file references in the message
    const repositories = detectRepositoryReferences(trimmedInput);
    const files = detectFileReferences(trimmedInput);
    const isFileRequest = isFileViewRequest(trimmedInput);
    const isRepoRequest = isRepositoryRequest(trimmedInput);

    // Auto-populate sidebar with repository if detected
    if (repositories.length > 0 && githubState.hasGitHubAccount) {
      const firstRepo = repositories[0];
      // Only switch if not already selected or different repo
      if (!githubState.selectedRepository || 
          githubState.selectedRepository.owner !== firstRepo.owner ||
          githubState.selectedRepository.repo !== firstRepo.repo) {
        try {
          // Ensure GitHub account is checked
          await checkGitHubAccount();
          // Switch to GitHub tool and select repository
          setSelectedTool("github");
          await selectRepository(firstRepo.owner, firstRepo.repo);
        } catch (error) {
          console.error("Failed to select repository:", error);
          // Continue with message even if repo selection fails
        }
      }
    }

    // Auto-open files if detected and user is asking to view them
    if (files.length > 0 && isFileRequest) {
      for (const file of files) {
        try {
          if (file.isGitHub && file.owner && file.repo && file.filePath) {
            // For GitHub files, ensure repository is selected first
            if (!githubState.selectedRepository ||
                githubState.selectedRepository.owner !== file.owner ||
                githubState.selectedRepository.repo !== file.repo) {
              await checkGitHubAccount();
              setSelectedTool("github");
              await selectRepository(file.owner, file.repo);
              // Wait a bit for repository to load
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Fetch GitHub file content
            const encodedOwner = encodeURIComponent(file.owner);
            const encodedRepo = encodeURIComponent(encodeURIComponent(file.repo));
            const response = await fetch(
              `/api/github/repo/${encodedOwner}/${encodedRepo}/file?path=${encodeURIComponent(file.filePath)}`
            );
            
            if (response.ok) {
              const data = await response.json();
              const { base64ToUtf8 } = await import("@/lib/utils/base64");
              const content = base64ToUtf8(data.content);
              
              // Detect language
              const ext = file.filePath.split(".").pop()?.toLowerCase() || "";
              const languageMap: Record<string, string> = {
                ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
                py: "python", java: "java", cpp: "cpp", c: "c", h: "c", hpp: "cpp",
                go: "go", rs: "rust", rb: "ruby", php: "php", swift: "swift",
                kt: "kotlin", scala: "scala", sh: "bash", bash: "bash",
                yml: "yaml", yaml: "yaml", json: "json", xml: "xml",
                html: "html", css: "css", md: "markdown", sql: "sql",
              };
              const language = languageMap[ext] || "plaintext";
              
              // Open file in editor (this will trigger 50/50 split view automatically)
              await openFile(file.path, content, language);
            }
          } else if (!file.isGitHub && sessionStatus === "connected") {
            // For local files, open directly if MCP session is active
            await openFile(file.path);
          }
        } catch (error) {
          console.error("Failed to auto-open file:", error);
          // Continue with message even if file opening fails
        }
      }
    }

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content: trimmedInput,
      status: "complete",
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const assistantMessage: Message = {
      id: createId(),
      role: "assistant",
      content: "",
      status: "streaming",
    };

    // Remove welcome message if it exists (filter out messages with isWelcomeMessage metadata)
    const messagesWithoutWelcome = messages.filter(
      (msg) => !msg.metadata?.isWelcomeMessage
    );

    // Build payload with file context if files are open
    const payload = toOutboundMessages([...messagesWithoutWelcome, userMessage]);

    // Inject email context FIRST if email is selected AND user is in email view
    // This ensures the LLM understands which email the user is referring to
    // Only include when selectedTool is "email" to avoid confusion in other contexts
    const emailContextMessage = selectedTool === "email" 
      ? buildEmailContextMessage(emailState.activeEmail, emailState.emails)
      : "";
    if (emailContextMessage) {
      payload.unshift({
        role: "system",
        content: emailContextMessage,
      });
    }

    // Inject system context message (gives LLM full system view)
    const systemContextMessage = buildSystemContextMessage(systemInfo);
    if (systemContextMessage) {
      payload.unshift({
        role: "system",
        content: systemContextMessage,
      });
    }

    // Inject tool capabilities message when MCP session is active
    const toolCapabilitiesMessage = buildToolCapabilitiesMessage(sessionStatus, securityMode);
    if (toolCapabilitiesMessage) {
      payload.unshift({
        role: "system",
        content: toolCapabilitiesMessage,
      });
    }

    // Inject working directory context
    if (currentDirectory) {
      const workingDirMessage = `📁 CURRENT WORKING DIRECTORY: ${currentDirectory}\n\nSMART PATH RESOLUTION:\n- When user references a file/directory by name, FIRST try resolving relative to this working directory\n- If relative path doesn't exist, THEN search common locations (~/Desktop, ~/Documents, ~/Downloads, ~)\n- Server-side preprocessing may have already resolved paths - check for resolved paths in user message\n- Use absolute paths in tool calls for reliability`;
      payload.unshift({
        role: "system",
        content: workingDirMessage,
      });
    }

    // Inject file context as system message if files are open
    const fileContextMessage = buildFileContextMessage(
      fileEditorState.openFiles,
      fileEditorState.activeFile
    );

    if (fileContextMessage) {
      payload.unshift({
        role: "system",
        content: fileContextMessage,
      });
    }

    // Find welcome message and trigger fade-out
    const welcomeMsg = messages.find((msg) => msg.metadata?.isWelcomeMessage);
    if (welcomeMsg) {
      setFadingOutWelcomeId(welcomeMsg.id);
      // Remove welcome message after fade-out animation completes (500ms)
      setTimeout(() => {
        setMessages((prev) => {
          const withoutWelcome = prev.filter((msg) => !msg.metadata?.isWelcomeMessage);
          return [...withoutWelcome, userMessage, assistantMessage];
        });
        setFadingOutWelcomeId(null);
      }, 500);
    } else {
      // No welcome message, just add new messages
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
    }
    setInput("");
    clearAttachments();
    setIsStreaming(true);
    
    // Reset user message visibility flag when new message is sent
    // Allow auto-scrolling initially so response can scroll
    userMessageVisibleRef.current = false;
    shouldAutoScrollRef.current = true;
    
    // Initially scroll to show the user message and start of response
    // The response will auto-scroll until user message reaches just under header
    setTimeout(() => {
      forceScrollToBottom(true);
    }, 0);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // LOCAL MODEL DISABLED - Using Gemini only
      // const useLocalModel = shouldUseLocalModel(trimmedInput, {
      //   hasToolCalls: false,
      //   previousMessages: messages.length,
      //   isFollowUp: messages.length > 0,
      // });

      // Always use Gemini API
      // Include current image context if available
      const currentImageId = imagenState.currentImage?.id || null;
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: payload,
          provider: "gemini-flash",
          selectedTool: selectedTool || null, // Pass selectedTool for context-aware tool loading
          currentImageId: currentImageId, // Pass current image ID for editing context
          workingDirectory: currentDirectory, // Pass working directory for server-side path resolution
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Handle rate limit errors (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 60;
          updateAssistantMessage(assistantMessage.id, (message) => ({
            ...message,
            status: "error",
            content: `⚠️ Rate limit exceeded. Please wait ${retrySeconds} seconds before trying again.\n\nTo reduce API usage:\n- Close unnecessary file tabs\n- Use shorter messages\n- Wait a moment between requests`,
            metadata: {
              ...message.metadata,
              thinking: undefined, // Clear thinking message on error
            },
          }));
          setIsStreaming(false);
          return;
        }
        
        // Handle MCP session required error with better message
        if (response.status === 403) {
          try {
            const errorData = await response.json();
            if (errorData.type === "mcp_session_required") {
              // Show error message in chat instead of blocking
              updateAssistantMessage(assistantMessage.id, (message) => ({
                ...message,
                status: "error",
                content: `⚠️ ${errorData.message || "Operation failed. Please check the error details above."}`,
                metadata: {
                  ...message.metadata,
                  thinking: undefined, // Clear thinking message on error
                },
              }));
              setIsStreaming(false);
              return;
            }
          } catch {
            // If JSON parsing fails, use default error
          }
        }
        throw new Error(`Request failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Streaming response body missing.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // Use recursive function to handle stream with potential function calls
      await handleStreamWithFunctionCalls(
        reader,
        decoder,
        assistantMessage.id,
        messages,
        userMessage,
        0
      );
    } catch (error) {
      if (controller.signal.aborted) {
        updateAssistantMessage(assistantMessage.id, (message) => ({
          ...message,
          status: "error",
          content: message.content || "Request cancelled.",
          metadata: {
            ...message.metadata,
            thinking: undefined, // Clear thinking message on error
          },
        }));
      } else {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred.";
        updateAssistantMessage(assistantMessage.id, (msg) => ({
          ...msg,
          status: "error",
          content: msg.content
            ? `${msg.content}\n\n⚠️ ${message}`
            : `⚠️ ${message}`,
          metadata: {
            ...msg.metadata,
            thinking: undefined, // Clear thinking message on error
          },
        }));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  // Handle image paste from clipboard
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault(); // prevent default paste behaviour
          await uploadImageFile(file);
        }
      }
    }
  };

  // Show connect button if File System is selected and user is authenticated
  const showFileSystemConnect = selectedTool === "filesystem" && isLoaded && user;

  // Show welcome message when starting a new chat
  useEffect(() => {
    // Only show if: user is signed in, messages are empty, chat exists, and we haven't shown welcome for this chat
    // Check if chat is empty (either activeChat is null/undefined or has no messages)
    const isChatEmpty = !activeChat || activeChat.messages.length === 0;
    
    // Add a small delay to ensure chat is fully initialized
    const timeoutId = setTimeout(() => {
      if (
        user &&
        isLoaded &&
        messages.length === 0 &&
        activeChatId &&
        isChatEmpty &&
        welcomeMessageShownRef.current !== activeChatId &&
        !isLoadingChatRef.current &&
        (sessionStatus === "connected" || !showFileSystemConnect)
      ) {
      const welcomeText = "What would you like to do? I can search the web, manage files, send emails, work with GitHub repositories, and run commands for you.";
      const welcomeMessageId = createId();
      
      // Mark that we've shown the welcome message for this chat BEFORE setting messages
      // This prevents the sync effect from clearing it
      welcomeMessageShownRef.current = activeChatId;
      
      // Set loading flag to prevent sync effect from interfering
      isLoadingChatRef.current = true;
      
      // Create initial empty message
      const welcomeMessage: Message = {
        id: welcomeMessageId,
        role: "assistant",
        content: "",
        status: "streaming",
        metadata: { isWelcomeMessage: true },
      };
      
      setMessages([welcomeMessage]);
      setIsStreaming(true);
      
      // Clear loading flag after a brief delay to allow welcome message to render
      setTimeout(() => {
        isLoadingChatRef.current = false;
      }, 200);
      
      // Stream the message character by character
      let currentIndex = 0;
      const streamInterval = setInterval(() => {
        if (currentIndex < welcomeText.length) {
          const newContent = welcomeText.slice(0, currentIndex + 1);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === welcomeMessageId
                ? { ...msg, content: newContent }
                : msg
            )
          );
          currentIndex++;
        } else {
          // Complete the message
          clearInterval(streamInterval);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === welcomeMessageId
                ? { ...msg, status: "complete" as MessageStatus }
                : msg
            )
          );
          setIsStreaming(false);
          
          // Save to chat manager
          if (activeChatId) {
            updateChatMessages(activeChatId, [
              {
                id: welcomeMessageId,
                role: "assistant",
                content: welcomeText,
                status: "complete",
                metadata: { isWelcomeMessage: true },
              },
            ]);
          }
        }
      }, 30); // 30ms per character for smooth typing effect
      
        return () => {
          clearInterval(streamInterval);
        };
      }
    }, 100); // Small delay to ensure chat is initialized
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [user, isLoaded, messages.length, activeChatId, activeChat, sessionStatus, showFileSystemConnect, updateChatMessages]);

  return (
    <div className="flex h-full flex-col overflow-hidden min-w-0">
      <div 
        ref={viewportRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 premium-scrollbar chat-viewport relative"
      >
        <div
          className="py-4 md:py-6 pb-24 px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 space-y-6 max-w-full"
        >
          {/* 🔴 LIVE TEST MARK - MCP Connection Active */}
          <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 text-center">
            <span className="text-green-400 font-semibold">🔴 LIVE TEST MARK - MCP Connection Active</span>
          </div>

          {/* Show sign-in buttons when user is not signed in */}
          {!user && isLoaded && (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] gap-4">
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                <SignInButton
                  mode="modal"
                  appearance={{
                    theme: dark,
                    elements: {
                      modalBackdrop: "bg-black/60 backdrop-blur-sm",
                      modalContent: "bg-background",
                      rootBox: "mx-auto",
                      card: "shadow-lg",
                    },
                  }}
                >
                  <Button variant="outline" size="lg" className="w-full sm:w-auto flex-1">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton
                  mode="modal"
                  appearance={{
                    theme: dark,
                    elements: {
                      modalBackdrop: "bg-black/60 backdrop-blur-sm",
                      modalContent: "bg-background",
                      rootBox: "mx-auto",
                      card: "shadow-lg",
                    },
                  }}
                >
                  <Button size="lg" className="w-full sm:w-auto flex-1">
                    Sign up for free
                  </Button>
                </SignUpButton>
              </div>
            </div>
          )}
          
          {/* Show mode selector or status when File System is selected but not connected */}
          {showFileSystemConnect && sessionStatus !== "connected" && (
            <div className="flex flex-col items-center justify-center min-h-[200px]">
              {sessionStatus === "selecting-mode" && (
                <SecurityModeSelector
                  onSelect={startMCPSession}
                  onCancel={() => {
                    setSelectedTool("chat");
                  }}
                />
              )}
              {sessionStatus === "starting" && (
                <div className="text-center space-y-2 max-w-md">
                  <h2 className="text-xl font-semibold">Starting MCP Server</h2>
                  <p className="text-sm text-muted-foreground">
                    Launching local server...
                  </p>
                </div>
              )}
              {sessionStatus === "error" && (
                <div className="w-full max-w-md space-y-4">
                  <div className="text-center space-y-2">
                    <p className="text-sm text-red-500 font-medium">Connection failed</p>
                    <p className="text-xs text-muted-foreground">
                      Failed to start MCP server. Please try again.
                    </p>
                  </div>
                </div>
              )}
              {sessionStatus === "disconnected" && (
                <div className="text-center space-y-2 max-w-md">
                  <h2 className="text-xl font-semibold">File System</h2>
                  <p className="text-sm text-muted-foreground">
                    Select a security mode to start
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Show chat messages (only when user is signed in) */}
          {user && (sessionStatus === "connected" || !showFileSystemConnect) && (messages.map((message, index): React.ReactElement => {
            // Track the last user message for visibility checking
            const isLastUserMessage = message.role === "user" && 
              (index === messages.length - 1 || 
              (index < messages.length - 1 && messages[index + 1]?.role === "assistant"));
            
            // Get tool call status for display
            type ToolCallType = NonNullable<Message["toolCalls"]>[number];
            const executingTool: (ToolCallType & { status: "executing" }) | undefined = message.toolCalls?.find(tc => tc.status === "executing") as (ToolCallType & { status: "executing" }) | undefined;
            // Type guard to ensure errorMessage is a string
            const toolCalls: ChatToolCall[] = Array.isArray(message.toolCalls)
              ? (message.toolCalls as ChatToolCall[])
              : [];
            const renderableToolCalls: RenderableToolCall[] = toolCalls.filter(isRenderableToolCall);
            const failedTool = toolCalls.find(
              (toolCall): toolCall is RenderableToolCall => toolCall.status === "error"
            );
            const toolCallCards: React.ReactElement[] = renderableToolCalls.map((toolCall) => {
              if (toolCall.name.startsWith("web_search")) {
                return <></>; // Skip rendering web search tools entirely
              } else {
                return <ToolCallCard key={toolCall.id} toolCall={toolCall} />;
              }
            }).filter(Boolean); // Filter out any empty fragments
            const errorMessage: string =
              !executingTool && typeof failedTool?.error === "string"
                ? failedTool.error.trim()
                : "";
            
            // Render error notice if there's an error message
            const renderErrorNotice = (): React.ReactNode => {
              if (!errorMessage) return null;
              return <ToolErrorNotice message={errorMessage} />;
            };
            
            // Check if this is a welcome message
            const isWelcomeMessage = message.metadata?.isWelcomeMessage;
            
            // Render welcome message centered at top without logo/icon
            if (isWelcomeMessage) {
              const isFadingOut = fadingOutWelcomeId === message.id;
              return (
                <div
                  key={message.id}
                  className={`flex flex-col items-center justify-center w-full py-8 px-4 transition-opacity duration-500 ${
                    isFadingOut ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <div className="max-w-2xl w-full text-center">
                    <div 
                      className={`whitespace-pre-wrap break-words overflow-wrap-anywhere text-yellow-50 dark:text-yellow-100 ${
                        message.status === "streaming" ? "streaming-text" : ""
                      } text-lg`}
                    >
                      {message.content ? (
                        <MessageContent content={message.content} metadata={message.metadata} />
                      ) : (
                        ""
                      )}
                    </div>
                  </div>
                </div>
              );
            }
            
            return (
              <div
                key={message.id}
                ref={isLastUserMessage ? (el) => {
                  if (el) lastUserMessageRef.current = el;
                } : undefined}
                className={`flex items-start gap-2 sm:gap-4 px-2 sm:px-4 md:px-6 lg:px-8 ${
                  message.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <span className="relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 overflow-hidden rounded-full border cursor-pointer transition-all hover:scale-110 hover:shadow-md active:scale-95">
                  <div className="flex h-full w-full items-center justify-center bg-background transition-colors hover:bg-muted/50">
                    {message.role === "assistant" ? (
                      <OperaStudioIcon />
                    ) : (
                      <UserIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                    )}
                  </div>
                </span>
                <div
                  className={`${message.role === "user" ? "max-w-[90%] sm:max-w-[85%] md:max-w-[80%]" : "max-w-full min-w-0"} ${
                    message.role === "user" 
                      ? "rounded-lg border bg-muted/50 p-2 sm:p-3 md:p-4 shadow-sm text-right" 
                      : message.role === "assistant" 
                        ? "relative"
                        : ""
                  }`}
                >
                  {/* Show image attachments */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className={`mb-3 flex flex-wrap gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      {message.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="relative group cursor-pointer"
                          title="Click to view full size"
                          onClick={() => openImage(attachment)}
                        >
                          <img
                            src={attachment.previewUrl}
                            alt={attachment.fileName}
                            className="max-w-[300px] max-h-[300px] rounded border border-border hover:opacity-90 transition-opacity"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                            {attachment.fileName} ({(attachment.sizeBytes / 1024).toFixed(1)} KB)
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Show ONLY currently executing tool - clean, minimal approach */}
                  {executingTool && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground animate-in fade-in duration-300">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{getToolActionMessage(executingTool.name)}</span>
                    </div>
                  )}

                  {renderErrorNotice()}

                  {/* Show all completed tool calls with rich summaries */}
                  {toolCallCards.length > 0 ? toolCallCards : null}

                  {/* Show thinking ONLY when no tools are executing and message is still streaming */}
                  {!message.toolCalls?.some(tc => tc.status === "executing") &&
                   message.status === "streaming" &&
                   message.metadata?.thinking && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground animate-in fade-in duration-300">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{getThinkingMessage(message.metadata)}</span>
                    </div>
                  )}
                  
                  <div 
                    className={`whitespace-pre-wrap break-words overflow-wrap-anywhere min-w-0 ${
                      message.status === "streaming" 
                        ? "streaming-text" 
                        : ""
                    } ${
                      message.role === "assistant" ? "text-lg" : "text-base"
                    } ${
                      message.metadata?.isWelcomeMessage ? "text-yellow-50 dark:text-yellow-100" : ""
                    }`}
                  >
                    {message.content ? (
                      <MessageContent content={message.content} metadata={message.metadata} />
                    ) : (
                      ""
                    )}
                  </div>
                  
                  {/* Show model indicator */}
                  {message.metadata?.model === "gemini-flash" && (
                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        Gemini API
                      </span>
                    </div>
                  )}

                  {/* Action buttons for assistant messages - Copy, Thumbs Up, Thumbs Down */}
                  {message.role === "assistant" && message.content && message.status !== "streaming" && (
                    <div className="flex items-center gap-1 mt-2 justify-end">
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(message.content);
                            // You could add a toast notification here if desired
                          } catch (err) {
                            console.error("Failed to copy:", err);
                          }
                        }}
                        className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                        title="Copy message"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          // Handle thumbs up feedback
                          console.log("Thumbs up for message:", message.id);
                        }}
                        className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                        title="Thumbs up"
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          // Handle thumbs down feedback
                          console.log("Thumbs down for message:", message.id);
                        }}
                        className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                        title="Thumbs down"
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          }) as React.ReactElement[])}
        </div>
      </div>
      {/* Always show input box - hide only when selecting mode */}
      {sessionStatus !== "selecting-mode" && (
        <div className="flex-shrink-0 border-t bg-background/95 backdrop-blur-sm flex flex-col">
          {/* Chat Tabs */}
          <ChatTabs />
          
          {/* MCP Connection Status Indicator */}
          {fileEditorState.openFiles.size > 0 && sessionStatus !== "connected" && (
            <div className="px-4 pt-4">
              <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-2 text-xs text-yellow-600 dark:text-yellow-500">
                <p className="font-medium">⚠️ File System Not Connected</p>
                <p className="mt-1 text-muted-foreground">
                  To edit files, connect to File System from the sidebar first.
                </p>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2 sm:gap-3 p-3 sm:p-4 border-t border-zinc-800/50 bg-zinc-900/30">
            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Input Row */}
              <div className="flex items-end gap-2 relative">
                {/* Left Side Button Container - Undo, Send, Upload */}
                <div className="flex flex-col gap-2 shrink-0">
                  {/* Undo Button */}
                  <Button
                    type="button"
                    size="icon"
                    onClick={async () => {
                      if (isStreaming) return;
                      
                      // Set input to "undo" and trigger send
                      setInput("undo");
                      // Use setTimeout to ensure state is updated before sending
                      setTimeout(() => {
                        const form = document.querySelector('form');
                        if (form) {
                          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                        }
                      }, 0);
                    }}
                    disabled={isStreaming}
                    className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg transition-all bg-white/10 border border-white/20 hover:bg-white/20 hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Undo last operation"
                  >
                    <Undo2 className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                    <span className="sr-only">Undo</span>
                  </Button>

                  {/* Send Button (shown when there's content) */}
                  <Button
                    type="submit"
                    size="icon"
                    className={`h-9 w-9 sm:h-10 sm:w-10 rounded-lg transition-all bg-white/10 border border-white/20 hover:bg-white/20 hover:border-white/30 ${
                      (input.trim() || attachments.length > 0) && !isStreaming ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                    disabled={(!input.trim() && attachments.length === 0) || isStreaming}
                  >
                    <SendHorizontal className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                    <span className="sr-only">Send</span>
                  </Button>
                  
                  {/* Upload Button */}
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming || isUploading}
                    className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg transition-all bg-white/10 border border-white/20 hover:bg-white/20 hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Upload Image"
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                    )}
                    <span className="sr-only">Upload Image</span>
                  </Button>
                </div>

                {/* Textarea Container */}
                <div className="flex-1 relative">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onPaste={handlePaste}
                    placeholder="Type your message..."
                    className={`min-h-[80px] sm:min-h-[100px] resize-none text-lg sm:text-xl ${attachments.length > 0 ? 'pr-2' : 'pr-2'}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e as any);
                      }
                    }}
                  />
                  {/* Image Preview Area - Inside the textarea, on the right side */}
                  {attachments.length > 0 && (
                    <div className="absolute top-2 right-2 flex items-center gap-2 pointer-events-none flex-row-reverse">
                      {attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="relative group pointer-events-auto cursor-pointer"
                          onClick={() => openImage(attachment)}
                          title="Click to view full size"
                        >
                          <img
                            src={attachment.thumbnailUrl}
                            alt={attachment.fileName}
                            className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded border border-border hover:opacity-90 transition-opacity"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAttachment(attachment.id);
                            }}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            title="Remove image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                            {attachment.fileName}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
