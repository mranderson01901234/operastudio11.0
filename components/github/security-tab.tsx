"use client";

import React from "react";
import { useGitHub } from "@/contexts/github-context";
import { Shield, AlertTriangle, CheckCircle2 } from "lucide-react";

export function SecurityTab() {
  const { state } = useGitHub();
  const { selectedRepository } = state;

  if (!selectedRepository) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a repository to view security</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border p-4">
        <h2 className="text-lg font-semibold">Security</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Security policies, advisories, and dependency alerts
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 border border-border rounded-lg">
            <Shield className="w-5 h-5 text-blue-500" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Security Policy</h3>
              <p className="text-xs text-muted-foreground mt-1">
                View or create a security policy for this repository
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 border border-border rounded-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Dependabot Alerts</h3>
              <p className="text-xs text-muted-foreground mt-1">
                View security vulnerabilities in dependencies
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 border border-border rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Code Scanning</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Automated security scanning for code vulnerabilities
              </p>
            </div>
          </div>
        </div>

        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">
            Security features require repository admin access
          </p>
        </div>
      </div>
    </div>
  );
}

