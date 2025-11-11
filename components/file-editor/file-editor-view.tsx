"use client";

import { useMemo, useEffect } from "react";
import { useFileEditor } from "@/contexts/file-editor-context";
import { useGitHub } from "@/contexts/github-context";
import { FileTabs } from "./file-tabs";
import { CodeEditor } from "./code-editor";
import { FileStatusBar } from "./file-status-bar";
import { RepositoryHeader } from "@/components/github/repository-header";
import { RepositoryTabs } from "@/components/github/repository-tabs";
import { IssuesTab } from "@/components/github/issues-tab";
import { PullRequestsTab } from "@/components/github/pull-requests-tab";
import { ActionsTab } from "@/components/github/actions-tab";
import { ProjectsTab } from "@/components/github/projects-tab";
import { WikiTab } from "@/components/github/wiki-tab";
import { SecurityTab } from "@/components/github/security-tab";
import { InsightsTab } from "@/components/github/insights-tab";
import { SettingsTab } from "@/components/github/settings-tab";

export function FileEditorView() {
  const { state } = useFileEditor();
  const { activeFile, openFiles } = state;
  const { state: githubState, setActiveTab, loadRepositoryDetails, loadRepositoryFiles } = useGitHub();

  // Check if any open file is a GitHub file and extract repository info
  const githubFileInfo = useMemo(() => {
    if (!activeFile || !activeFile.startsWith("github://")) {
      return null;
    }

    // Parse github://owner/repo/path
    const match = activeFile.match(/^github:\/\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!match) {
      return null;
    }

    const [, owner, repo] = match;
    return { owner, repo };
  }, [activeFile]);

  // Use GitHub context repository if available, otherwise use parsed info
  const repositoryInfo = githubState.selectedRepository || githubFileInfo;
  const showGitHubHeader = repositoryInfo !== null;

  // Load repository details if we have a GitHub file but details aren't loaded
  useEffect(() => {
    if (githubFileInfo && !githubState.selectedRepository && !githubState.repositoryDetails) {
      // Load details for the repository from the file path
      loadRepositoryDetails(githubFileInfo.owner, githubFileInfo.repo).catch(() => {
        // Error already handled in loadRepositoryDetails
      });
    }
  }, [githubFileInfo, githubState.selectedRepository, githubState.repositoryDetails, loadRepositoryDetails]);

  // Determine if we should show GitHub tab content or code editor
  const showGitHubTabContent = showGitHubHeader && githubState.activeTab !== "code";
  const showCodeEditor = !showGitHubHeader || githubState.activeTab === "code";

  // Render GitHub tab content component
  const renderGitHubTabContent = () => {
    switch (githubState.activeTab) {
      case "issues":
        return <IssuesTab />;
      case "pulls":
        return <PullRequestsTab />;
      case "actions":
        return <ActionsTab />;
      case "projects":
        return <ProjectsTab />;
      case "wiki":
        return <WikiTab />;
      case "security":
        return <SecurityTab />;
      case "insights":
        return <InsightsTab />;
      case "settings":
        return <SettingsTab />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a]">
      {/* GitHub Repository Header and Tabs - shown when viewing GitHub files */}
      {showGitHubHeader && (
        <>
          <RepositoryHeader
            repository={repositoryInfo}
            details={githubState.repositoryDetails}
          />
          <RepositoryTabs
            activeTab={githubState.activeTab}
            onTabChange={setActiveTab}
          />
        </>
      )}
      
      {/* File Tabs - only show when viewing code */}
      {showCodeEditor && <FileTabs />}
      
      {/* Content Area - either GitHub tab content or code editor */}
      {showGitHubTabContent ? (
        <div className="flex-1 min-h-0 overflow-auto bg-background">
          {renderGitHubTabContent()}
        </div>
      ) : (
        <div className="flex-1 min-h-0 relative bg-[#1a1a1a]">
          <CodeEditor filePath={activeFile} className="h-full" />
        </div>
      )}
      
      {/* Status Bar - only show when viewing code */}
      {showCodeEditor && <FileStatusBar />}
    </div>
  );
}

