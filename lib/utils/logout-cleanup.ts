/**
 * Logout Cleanup Utility
 * 
 * This utility handles comprehensive cleanup of all user data when logging out.
 * It ensures no data leaks across user sessions.
 */

// All localStorage keys used by the application
const STORAGE_KEYS = {
  CHATS: "operastudio_chats",
  EMAIL_ACTIVE: "operastudio_email_active",
  EMAIL_FOLDER: "operastudio_email_folder",
  EMAIL_CACHE: "operastudio_email_cache",
  GITHUB_SELECTED_REPO: "operastudio_github_selected_repo",
  GITHUB_SIDEBAR_VIEW: "operastudio_github_sidebar_view",
  GITHUB_ACTIVE_TAB: "operastudio_github_active_tab",
  GITHUB_REPOS_CACHE: "operastudio_github_repos_cache",
  GITHUB_FILES_CACHE_PREFIX: "operastudio_github_files_",
  GITHUB_FILE_CONTENT_CACHE_PREFIX: "operastudio_github_file_content_",
} as const;

/**
 * Clear all localStorage data related to OperaStudio
 */
export function clearAllLocalStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    // Clear all known keys
    Object.values(STORAGE_KEYS).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`Failed to remove localStorage key ${key}:`, error);
      }
    });

    // Clear all GitHub file cache keys (they have dynamic prefixes)
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith(STORAGE_KEYS.GITHUB_FILES_CACHE_PREFIX) ||
        key.startsWith(STORAGE_KEYS.GITHUB_FILE_CONTENT_CACHE_PREFIX)
      )) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`Failed to remove localStorage key ${key}:`, error);
      }
    });

    console.log("✅ All localStorage data cleared");
  } catch (error) {
    console.error("❌ Error clearing localStorage:", error);
  }
}

/**
 * Stop active MCP session
 */
export async function stopActiveSession(): Promise<void> {
  try {
    const response = await fetch("/api/mcp/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      console.log("✅ Active MCP session stopped");
    } else {
      console.warn("⚠️ Failed to stop MCP session (may not be active)");
    }
  } catch (error) {
    // Silently fail - session may not exist
    console.debug("MCP session stop attempt (may not be active):", error);
  }
}

/**
 * Comprehensive logout cleanup
 * 
 * This function should be called when a user logs out to ensure:
 * 1. All localStorage data is cleared
 * 2. Active sessions are stopped
 * 3. No user data persists in the browser
 */
export async function performLogoutCleanup(): Promise<void> {
  console.log("🧹 Starting logout cleanup...");

  // Stop active session first
  await stopActiveSession();

  // Clear all localStorage
  clearAllLocalStorage();

  console.log("✅ Logout cleanup complete");
}

/**
 * Get list of all localStorage keys used by OperaStudio
 * Useful for debugging and security audits
 */
export function getOperaStudioStorageKeys(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("operastudio_")) {
      keys.push(key);
    }
  }

  return keys;
}

