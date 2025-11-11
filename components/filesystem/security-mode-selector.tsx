"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Shield, Zap, Lock } from "lucide-react";

type SecurityMode = "SAFE" | "BALANCED" | "UNRESTRICTED";

interface SecurityModeSelectorProps {
  onSelect: (mode: SecurityMode, durationMinutes?: number) => void;
  onCancel?: () => void;
}

export function SecurityModeSelector({ onSelect, onCancel }: SecurityModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<SecurityMode | null>(null);

  const handleStart = () => {
    if (selectedMode) {
      // No duration required - sessions don't expire by default
      onSelect(selectedMode);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">Select Security Mode</h2>
        <p className="text-sm text-muted-foreground">
          Choose the level of access you want to grant to your local environment
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Safe Mode */}
        <div
          className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
            selectedMode === "SAFE"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          onClick={() => setSelectedMode("SAFE")}
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold">Safe Mode</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Read-only access to your home directory. No command execution.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>✓ Read files</li>
            <li>✓ List directories</li>
            <li>✗ Write files</li>
            <li>✗ Run commands</li>
          </ul>
        </div>

        {/* Balanced Mode */}
        <div
          className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
            selectedMode === "BALANCED"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          onClick={() => setSelectedMode("BALANCED")}
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            <h3 className="font-semibold">Balanced Mode</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Read/write access to common directories. Limited command execution.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>✓ Read/write files</li>
            <li>✓ List directories</li>
            <li>✓ Safe commands only</li>
            <li>✗ System directories</li>
          </ul>
        </div>

        {/* Unrestricted Mode */}
        <div
          className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
            selectedMode === "UNRESTRICTED"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          onClick={() => setSelectedMode("UNRESTRICTED")}
        >
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-5 w-5 text-red-500" />
            <h3 className="font-semibold">Unrestricted</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Full access to your system. Use with caution.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>✓ Full file access</li>
            <li>✓ All commands</li>
            <li>✓ System directories</li>
            <li>⚠️ No restrictions</li>
          </ul>
        </div>
      </div>


      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleStart}
          disabled={!selectedMode}
          className="min-w-[120px]"
        >
          Start Session
        </Button>
      </div>
    </div>
  );
}

