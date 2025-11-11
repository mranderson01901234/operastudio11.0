/**
 * Utility functions for protocol handler detection and fallback
 */

/**
 * Check if protocol handler is likely registered
 * This is a best-effort check - not 100% reliable
 */
export function checkProtocolHandler(): {
  supported: boolean;
  method: "unknown" | "direct" | "fallback";
} {
  // Check if we're in a browser environment
  if (typeof window === "undefined") {
    return { supported: false, method: "unknown" };
  }

  // Try to detect if protocol handler might be registered
  // This is not foolproof, but can help with debugging
  const userAgent = navigator.userAgent.toLowerCase();
  const isMac = /mac|darwin/.test(userAgent);
  const isWindows = /win/.test(userAgent);
  const isLinux = /linux/.test(userAgent);

  // On macOS, protocol handlers are usually registered
  // On Linux/Windows, they might not be
  return {
    supported: true, // Assume supported, let OS handle it
    method: isMac ? "direct" : isLinux || isWindows ? "fallback" : "unknown",
  };
}

/**
 * Open protocol URL with timeout detection
 */
export async function openProtocolUrl(
  url: string,
  onTimeout?: () => void
): Promise<void> {
  // Create a hidden iframe to trigger protocol handler
  // This is more reliable than window.location.href in some browsers
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  document.body.appendChild(iframe);

  // Also try window.location as fallback
  try {
    window.location.href = url;
  } catch (e) {
    console.error("Failed to open protocol URL:", e);
  }

  // Clean up iframe after a short delay
  setTimeout(() => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }, 1000);

  // Set timeout to detect if launcher didn't open
  if (onTimeout) {
    setTimeout(() => {
      onTimeout();
    }, 5000); // 5 second timeout
  }
}

/**
 * Detect if we're in a development environment
 */
export function isDevelopment(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

