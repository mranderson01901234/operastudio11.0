"use client";

import React, { useState } from "react";
import { useGitHub } from "@/contexts/github-context";
import {
  Settings,
  Lock,
  Globe,
  GitBranch,
  Users,
  Webhook,
  Key,
  Shield,
  FileText,
  Code,
  Play,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SettingsSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  items: SettingsItem[];
}

interface SettingsItem {
  id: string;
  label: string;
  description: string;
  value?: string | React.ReactNode;
  action?: () => void;
  externalLink?: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

export function SettingsTab() {
  const { state } = useGitHub();
  const { selectedRepository, repositoryDetails } = state;
  const [expandedSection, setExpandedSection] = useState<string | null>("general");

  if (!selectedRepository) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a repository to view settings</p>
      </div>
    );
  }

  const settingsSections: SettingsSection[] = [
    {
      id: "general",
      title: "General",
      icon: Settings,
      description: "Repository name, description, and visibility",
      items: [
        {
          id: "name",
          label: "Repository name",
          description: "Change the repository name",
          value: repositoryDetails?.name || selectedRepository.repo,
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings` : undefined,
        },
        {
          id: "description",
          label: "Description",
          description: "A short description of your repository",
          value: repositoryDetails?.description || "No description",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings` : undefined,
        },
        {
          id: "visibility",
          label: "Visibility",
          description: "Change repository visibility",
          value: repositoryDetails?.private ? (
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span>Private</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <span>Public</span>
            </div>
          ),
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings` : undefined,
        },
        {
          id: "default-branch",
          label: "Default branch",
          description: "The default branch for this repository",
          value: repositoryDetails?.default_branch || "main",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings/branches` : undefined,
        },
      ],
    },
    {
      id: "branches",
      title: "Branches",
      icon: GitBranch,
      description: "Branch protection rules and default branch settings",
      items: [
        {
          id: "branch-protection",
          label: "Branch protection rules",
          description: "Protect important branches from force pushes and deletion",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings/branches` : undefined,
        },
        {
          id: "default-branch-settings",
          label: "Default branch",
          description: `Current default branch: ${repositoryDetails?.default_branch || "main"}`,
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings/branches` : undefined,
        },
      ],
    },
    {
      id: "collaborators",
      title: "Collaborators",
      icon: Users,
      description: "Manage repository access and permissions",
      items: [
        {
          id: "manage-access",
          label: "Manage access",
          description: "Add or remove collaborators and manage their permissions",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings/access` : undefined,
        },
      ],
    },
    {
      id: "webhooks",
      title: "Webhooks",
      icon: Webhook,
      description: "Configure webhooks to receive repository events",
      items: [
        {
          id: "manage-webhooks",
          label: "Manage webhooks",
          description: "Add webhooks to receive HTTP POST payloads when repository events occur",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings/hooks` : undefined,
        },
      ],
    },
    {
      id: "deploy-keys",
      title: "Deploy keys",
      icon: Key,
      description: "SSH keys that grant access to a single repository",
      items: [
        {
          id: "manage-keys",
          label: "Manage deploy keys",
          description: "Add SSH keys that allow access to this repository",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings/keys` : undefined,
        },
      ],
    },
    {
      id: "security",
      title: "Security",
      icon: Shield,
      description: "Security policies, code scanning, and secret scanning",
      items: [
        {
          id: "security-policy",
          label: "Security policy",
          description: "Add a SECURITY.md file to your repository",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/security` : undefined,
        },
        {
          id: "code-scanning",
          label: "Code scanning",
          description: "Automated security scanning for code vulnerabilities",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/security/code-scanning` : undefined,
        },
        {
          id: "secret-scanning",
          label: "Secret scanning",
          description: "Automatically detect secrets in your code",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/security/secret-scanning` : undefined,
        },
        {
          id: "dependabot",
          label: "Dependabot alerts",
          description: "View security vulnerabilities in dependencies",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/security/dependabot` : undefined,
        },
      ],
    },
    {
      id: "actions",
      title: "Actions",
      icon: Play,
      description: "GitHub Actions settings and permissions",
      items: [
        {
          id: "actions-permissions",
          label: "Actions permissions",
          description: "Control which actions and reusable workflows can be used",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings/actions` : undefined,
        },
        {
          id: "workflow-permissions",
          label: "Workflow permissions",
          description: "Configure the default permissions granted to the GITHUB_TOKEN",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings/actions` : undefined,
        },
      ],
    },
    {
      id: "pages",
      title: "Pages",
      icon: FileText,
      description: "GitHub Pages settings for hosting static sites",
      items: [
        {
          id: "pages-settings",
          label: "Pages settings",
          description: "Configure GitHub Pages source and custom domain",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings/pages` : undefined,
        },
      ],
    },
    {
      id: "danger",
      title: "Danger Zone",
      icon: AlertTriangle,
      description: "Irreversible and destructive actions",
      items: [
        {
          id: "transfer",
          label: "Transfer ownership",
          description: "Transfer this repository to another user or organization",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings` : undefined,
          badge: "Danger",
          badgeVariant: "destructive",
        },
        {
          id: "archive",
          label: "Archive this repository",
          description: "Mark this repository as archived and read-only",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings` : undefined,
          badge: "Danger",
          badgeVariant: "destructive",
        },
        {
          id: "delete",
          label: "Delete this repository",
          description: "Once you delete a repository, there is no going back",
          externalLink: repositoryDetails?.html_url ? `${repositoryDetails.html_url}/settings` : undefined,
          badge: "Danger",
          badgeVariant: "destructive",
        },
      ],
    },
  ];

  const toggleSection = (sectionId: string) => {
    setExpandedSection(expandedSection === sectionId ? null : sectionId);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border p-4">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Repository settings and configuration
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-4">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSection === section.id;

            return (
              <div key={section.id} className="border border-border rounded-lg overflow-hidden">
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors",
                    isExpanded && "bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                    <div className="text-left">
                      <h3 className="text-sm font-semibold">{section.title}</h3>
                      <p className="text-xs text-muted-foreground">{section.description}</p>
                    </div>
                  </div>
                  <ChevronRight
                    className={cn(
                      "w-4 h-4 text-muted-foreground transition-transform",
                      isExpanded && "transform rotate-90"
                    )}
                  />
                </button>

                {/* Section Content */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    {section.items.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-start justify-between p-3 rounded-md",
                          item.externalLink && "hover:bg-muted/50 cursor-pointer transition-colors"
                        )}
                        onClick={() => {
                          if (item.externalLink) {
                            window.open(item.externalLink, "_blank");
                          } else if (item.action) {
                            item.action();
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium">{item.label}</h4>
                            {item.badge && (
                              <Badge variant={item.badgeVariant || "default"} className="text-xs">
                                {item.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{item.description}</p>
                          {item.value && (
                            <div className="text-sm text-foreground mt-1">
                              {typeof item.value === "string" ? item.value : item.value}
                            </div>
                          )}
                        </div>
                        {item.externalLink && (
                          <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Info Banner */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  Settings Management
                </h4>
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  Some settings require repository admin access. Click on any setting to open it on GitHub
                  {repositoryDetails?.html_url && (
                    <a
                      href={`${repositoryDetails.html_url}/settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 underline hover:no-underline"
                    >
                      or view all settings →
                    </a>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
