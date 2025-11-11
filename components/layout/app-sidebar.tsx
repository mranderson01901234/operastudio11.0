"use client";

import dynamic from "next/dynamic";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { SidebarNav } from "./sidebar-nav";
import { FileTree } from "@/components/filesystem/file-tree";
import { useFileSystem } from "@/contexts/filesystem-context";
import { useGitHub } from "@/contexts/github-context";
import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

// Loading skeleton component for better UX
function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col h-full p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-4 w-4 bg-muted rounded" />
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-2 pl-4">
          <div className="h-3 w-3 bg-muted rounded" />
          <div className="h-3 flex-1 bg-muted rounded" style={{ width: `${60 + Math.random() * 30}%` }} />
        </div>
      ))}
      <div className="text-xs text-muted-foreground text-center mt-4">{label}</div>
    </div>
  );
}

// Lazy load EmailList and GitHub components to reduce initial bundle
// These are only needed when user selects those tools
const EmailList = dynamic(() => import("@/components/email/email-list").then(mod => ({ default: mod.EmailList })), {
  ssr: false,
  loading: () => <LoadingSkeleton label="Loading emails..." />,
});

const RepositoryList = dynamic(() => import("@/components/github/repository-list").then(mod => ({ default: mod.RepositoryList })), {
  ssr: false,
  loading: () => <LoadingSkeleton label="Loading repositories..." />,
});

const RepositoryFileTree = dynamic(() => import("@/components/github/repository-file-tree").then(mod => ({ default: mod.RepositoryFileTree })), {
  ssr: false,
  loading: () => <LoadingSkeleton label="Loading files..." />,
});

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
      className="w-8 h-8 text-foreground"
    >
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="m5.6 5.6 12.8 12.8" />
      <path d="m5.6 18.4 12.8-12.8" />
    </svg>
  );
}

export function AppSidebar() {
  const { selectedTool, sessionStatus, securityMode } = useFileSystem();
  const { state: githubState } = useGitHub();
  const { isSignedIn } = useUser();
  const showFileTree = selectedTool === "filesystem" && sessionStatus === "connected";
  const showEmailList = selectedTool === "email";
  // Show RepositoryFileTree when github is selected, has account, and sidebarView is files
  const showGitHubFiles = selectedTool === "github" && githubState.hasGitHubAccount && githubState.sidebarView === "files";
  // Show RepositoryList when github is selected (handles both connect UI and repository list)
  const showGitHubRepos = selectedTool === "github" && !showGitHubFiles;


  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <OperaStudioIcon />
          <span className="text-lg font-semibold text-foreground">OperaStudio</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="flex-1 min-h-0 overflow-hidden">
        {showFileTree ? (
          <FileTree />
        ) : showEmailList ? (
          <EmailList />
        ) : showGitHubFiles ? (
          <RepositoryFileTree />
        ) : showGitHubRepos ? (
          <RepositoryList />
        ) : (
          <SidebarNav />
        )}
      </SidebarContent>
      <SidebarFooter className="flex-shrink-0 border-t border-sidebar-border bg-sidebar p-2">
        {/* User Button and Settings on same horizontal line */}
        <div className="flex items-center justify-between px-2 gap-2">
          <div className="flex-1 flex items-center">
            {isSignedIn ? (
              <UserButton
                appearance={{
                  theme: dark,
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            ) : null}
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="default">
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

