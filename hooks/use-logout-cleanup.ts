"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { performLogoutCleanup } from "@/lib/utils/logout-cleanup";

/**
 * Hook to handle logout cleanup
 * 
 * This hook listens for user logout events and performs comprehensive cleanup:
 * - Clears all localStorage data
 * - Stops active MCP sessions
 * - Resets all context state
 */
export function useLogoutCleanup() {
  const { isSignedIn, isLoaded } = useUser();

  useEffect(() => {
    // Only run cleanup when user state is loaded and user is signed out
    if (isLoaded && !isSignedIn) {
      console.log("🔐 User signed out, performing cleanup...");
      performLogoutCleanup().catch((error) => {
        console.error("❌ Error during logout cleanup:", error);
      });
    }
  }, [isSignedIn, isLoaded]);
}

