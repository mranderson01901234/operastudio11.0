"use client";

import { Button } from "@/components/ui/button";
import { PanelLeft } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

export function AppHeader() {
  const { toggleSidebar } = useSidebar();

  return (
    <div className="sticky top-0 z-10 shrink-0 border-b bg-background/80 backdrop-blur-sm">
      <header className="flex h-12 items-center px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 md:hidden"
          onClick={toggleSidebar}
        >
          <PanelLeft />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
      </header>
    </div>
  );
}

