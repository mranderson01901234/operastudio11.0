"use client";

import { useModelInit } from "@/hooks/use-model-init";

/**
 * Provider component that triggers model initialization on sign-in
 */
export function ModelInitProvider({ children }: { children: React.ReactNode }) {
  useModelInit();
  return <>{children}</>;
}

