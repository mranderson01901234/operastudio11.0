"use client";

import React, { useState, useRef, useEffect } from "react";
import { Terminal, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CommandStreamEvent {
  type: "stdout" | "stderr" | "exit" | "error";
  data?: string;
  exitCode?: number;
  signal?: string;
  error?: string;
}

interface CommandOutputStreamProps {
  command: string;
  args: string[];
  sessionId: string;
  useSudo?: boolean;
  onComplete?: (exitCode: number) => void;
  onError?: (error: string) => void;
}

/**
 * Component that streams command output in real-time.
 * Connects to /api/mcp/stream-command and displays stdout/stderr as it arrives.
 */
export function CommandOutputStream({
  command,
  args,
  sessionId,
  useSudo,
  onComplete,
  onError,
}: CommandOutputStreamProps) {
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new output arrives
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    let abortController: AbortController | null = null;

    const streamCommand = async () => {
      try {
        abortController = new AbortController();

        const response = await fetch("/api/mcp/stream-command", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            command,
            args,
            sessionId,
            useSudo,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Command execution failed");
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);

              if (data === "[DONE]") {
                setIsRunning(false);
                break;
              }

              try {
                const event: CommandStreamEvent = JSON.parse(data);

                if (event.type === "stdout" && event.data) {
                  setOutput((prev) => [...prev, event.data!]);
                } else if (event.type === "stderr" && event.data) {
                  setOutput((prev) => [...prev, `⚠️ ${event.data!}`]);
                } else if (event.type === "exit") {
                  setExitCode(event.exitCode ?? null);
                  setIsRunning(false);

                  if (onComplete && event.exitCode !== null) {
                    onComplete(event.exitCode);
                  }
                } else if (event.type === "error") {
                  setError(event.error || "Unknown error");
                  setIsRunning(false);

                  if (onError) {
                    onError(event.error || "Unknown error");
                  }
                }
              } catch (e) {
                console.error("Failed to parse SSE data:", e);
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // User aborted, ignore
          return;
        }

        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setError(errorMsg);
        setIsRunning(false);

        if (onError) {
          onError(errorMsg);
        }
      }
    };

    streamCommand();

    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [command, args, sessionId, useSudo, onComplete, onError]);

  const commandString = `${useSudo ? "sudo " : ""}${command} ${args.join(" ")}`;

  return (
    <Card className="mb-4 border-zinc-700 bg-zinc-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-mono flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          {commandString}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Output terminal */}
        <div
          ref={outputRef}
          className="bg-black/50 rounded-md p-3 font-mono text-xs max-h-64 overflow-y-auto whitespace-pre-wrap"
        >
          {output.length === 0 && isRunning && (
            <p className="text-muted-foreground animate-pulse">Running command...</p>
          )}
          {output.map((line, i) => (
            <div key={i} className="text-gray-300">
              {line}
            </div>
          ))}
        </div>

        {/* Status footer */}
        {!isRunning && (
          <div className="mt-2 flex items-center gap-2">
            {error ? (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-xs text-red-500">{error}</span>
              </>
            ) : exitCode === 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-foreground" />
                <span className="text-xs text-foreground">Command completed successfully</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-xs text-red-500">
                  Command failed with exit code {exitCode}
                </span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
