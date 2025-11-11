import { useState, useEffect } from "react";
import type { SystemInfo } from "@/lib/mcp/system-info-types";

// Re-export for convenience
export type { SystemInfo };

/**
 * Hook to fetch and manage system information for the active MCP session
 * 
 * Automatically fetches system info when session status is "connected"
 * and provides it for use in LLM system messages.
 */
export function useSystemInfo(sessionStatus: string) {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "connected") {
      setSystemInfo(null);
      setError(null);
      return;
    }

    // Fetch system info when session is connected
    setLoading(true);
    setError(null);

    fetch("/api/system/info")
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            // No active session - this is OK, just return null
            return null;
          }
          throw new Error(`Failed to fetch system info: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        // Check if response has error field (backwards compatibility)
        if (data && !data.error) {
          setSystemInfo(data);
        } else {
          // System info not available yet (old session without system info)
          setSystemInfo(null);
        }
      })
      .catch((err) => {
        console.error("Error fetching system info:", err);
        setError(err.message);
        setSystemInfo(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionStatus]);

  return { systemInfo, loading, error };
}

