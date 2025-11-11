"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { TaskExecutionProgress } from "@/lib/chat/task-planner";

interface TaskProgressPanelProps {
  goal: string;
  steps: TaskExecutionProgress[];
  currentStepIndex?: number;
}

/**
 * Displays real-time progress of multi-step task execution.
 * Shows each step with status icons, expandable output, and overall progress.
 */
export function TaskProgressPanel({
  goal,
  steps,
  currentStepIndex,
}: TaskProgressPanelProps) {
  const totalSteps = steps[0]?.totalSteps || steps.length;
  const completedSteps = steps.filter((s) => s.status === "completed").length;
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <Card className="mb-4 border-blue-500/30 bg-blue-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          {goal}
        </CardTitle>
        <Progress value={progressPercent} className="h-1.5 mt-2" />
        <p className="text-xs text-muted-foreground mt-1">
          {completedSteps} of {totalSteps} steps completed
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {steps.map((step, index) => (
          <TaskStepDisplay
            key={step.stepId}
            step={step}
            index={index}
            isActive={index === currentStepIndex}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface TaskStepDisplayProps {
  step: TaskExecutionProgress;
  index: number;
  isActive: boolean;
}

function TaskStepDisplay({ step, index, isActive }: TaskStepDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Icon based on status
  const StatusIcon = () => {
    switch (step.status) {
      case "executing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-foreground" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "skipped":
        return <ChevronRight className="h-4 w-4 text-gray-400" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
    }
  };

  const hasOutput = step.output || step.error;
  const canExpand = hasOutput && (step.output?.length ?? 0) > 100;

  return (
    <div
      className={`flex flex-col gap-1 p-2 rounded-md transition-colors ${
        isActive ? "bg-blue-500/10" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <StatusIcon />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Step {index + 1}:</span>
            <span className="text-sm font-medium truncate">{step.description}</span>
          </div>

          {/* Show output inline if short, or make it expandable */}
          {hasOutput && !canExpand && (
            <div className="mt-1">
              {step.error ? (
                <p className="text-xs text-red-500 font-mono">{step.error}</p>
              ) : (
                <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">
                  {step.output}
                </p>
              )}
            </div>
          )}

          {/* Expandable output for longer content */}
          {canExpand && (
            <div className="mt-1">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {isExpanded ? "Hide" : "Show"} output
              </button>
              {isExpanded && (
                <pre className="mt-2 p-2 bg-muted rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
                  {step.error || step.output}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
