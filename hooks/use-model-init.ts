"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";

/**
 * Hook to initialize local model in background when user signs in
 */
export function useModelInit() {
  const { isSignedIn, isLoaded } = useUser();
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    // Only initialize once when user signs in
    if (!isLoaded) return;
    if (!isSignedIn) {
      hasInitializedRef.current = false;
      return;
    }
    if (hasInitializedRef.current) return;

    // Mark as initialized to prevent multiple calls
    hasInitializedRef.current = true;

    // LOCAL MODEL DISABLED - Commented out initialization
    // fetch("/api/local-model/init", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    // })
    //   .then((response) => {
    //     if (response.ok) {
    //       console.log("[Model Init] Background initialization started");
    //     } else {
    //       console.warn("[Model Init] Failed to start initialization:", response.status);
    //     }
    //   })
    //   .catch((error) => {
    //     console.error("[Model Init] Error starting initialization:", error);
    //   });
  }, [isSignedIn, isLoaded]);
}

