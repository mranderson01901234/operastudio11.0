"use client";

import { useLogoutCleanup } from "@/hooks/use-logout-cleanup";

/**
 * LogoutCleanup Component
 * 
 * This component handles cleanup when users log out.
 * It should be placed high in the component tree to ensure
 * cleanup happens regardless of which page the user is on.
 */
export function LogoutCleanup() {
  useLogoutCleanup();
  return null; // This component doesn't render anything
}

