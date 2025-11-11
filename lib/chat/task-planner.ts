/**
 * Task Planning Types and Utilities
 *
 * This module defines the structure for multi-step task execution.
 * The LLM can return a structured task plan that the orchestrator executes.
 */

import { ToolCall } from "./tool-handler";

export interface TaskStep {
  id: string;
  description: string; // Human-readable description (e.g., "Update package lists")
  toolCall: ToolCall;
  critical: boolean; // If true, task fails if this step fails
  retryable: boolean; // If true, auto-retry with sudo on permission errors
  validation?: Partial<ToolCall>; // Optional validation command to run after this step
}

export interface TaskPlan {
  goal: string; // Overall goal (e.g., "Install VirtualBox")
  steps: TaskStep[];
  currentStep: number;
}

export interface TaskExecutionProgress {
  stepId: string;
  stepIndex: number;
  totalSteps: number;
  status: "executing" | "completed" | "failed" | "skipped";
  description: string;
  output?: string;
  error?: string;
}

export type TaskExecutionResult =
  | { status: "success"; steps: TaskExecutionProgress[] }
  | { status: "failed"; steps: TaskExecutionProgress[]; failedStep: TaskStep; error: string }
  | { status: "partial"; steps: TaskExecutionProgress[]; completedCount: number };

/**
 * Parse a task plan from LLM response.
 * The LLM can optionally respond with a JSON task plan for complex multi-step operations.
 */
export function parseTaskPlan(llmResponse: string): TaskPlan | null {
  try {
    // Look for JSON task plan in response
    const jsonMatch = llmResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[1]);

    // Validate structure
    if (!parsed.taskPlan || !parsed.taskPlan.goal || !Array.isArray(parsed.taskPlan.steps)) {
      return null;
    }

    const plan: TaskPlan = {
      goal: parsed.taskPlan.goal,
      steps: parsed.taskPlan.steps.map((step: any, index: number) => ({
        id: step.id || `step-${index}`,
        description: step.description || "Unknown step",
        toolCall: step.toolCall,
        critical: step.critical ?? true,
        retryable: step.retryable ?? true,
        validation: step.validation,
      })),
      currentStep: 0,
    };

    return plan;
  } catch (error) {
    console.error("[Task Planner] Failed to parse task plan:", error);
    return null;
  }
}

/**
 * Create a simple sequential task plan from a list of tool calls.
 * Used when LLM doesn't provide a structured plan but makes multiple tool calls.
 */
export function createSequentialPlan(
  goal: string,
  toolCalls: ToolCall[],
  descriptions?: string[]
): TaskPlan {
  return {
    goal,
    steps: toolCalls.map((toolCall, index) => ({
      id: `step-${index}`,
      description: descriptions?.[index] || getToolDescription(toolCall),
      toolCall,
      critical: true,
      retryable: toolCall.name === "cmd_execute",
      validation: undefined,
    })),
    currentStep: 0,
  };
}

/**
 * Generate a human-readable description from a tool call.
 */
function getToolDescription(toolCall: ToolCall): string {
  if (toolCall.name === "cmd_execute") {
    const cmd = toolCall.arguments.command as string;
    const args = (toolCall.arguments.args as string[])?.join(" ") || "";
    return `Running: ${cmd} ${args}`;
  }

  if (toolCall.name === "fs_write") {
    const path = toolCall.arguments.path as string;
    const filename = path.split("/").pop() || path;
    return `Writing file: ${filename}`;
  }

  if (toolCall.name === "fs_read") {
    const path = toolCall.arguments.path as string;
    const filename = path.split("/").pop() || path;
    return `Reading file: ${filename}`;
  }

  // Generic description
  return `Executing: ${toolCall.name}`;
}

/**
 * Check if a step should be retried based on the error.
 */
export function shouldRetryStep(step: TaskStep, error: string): boolean {
  if (!step.retryable) {
    return false;
  }

  // Retry on permission errors
  if (
    error.includes("Permission denied") ||
    error.includes("EACCES") ||
    error.includes("SUDO_REQUIRED")
  ) {
    return true;
  }

  return false;
}

/**
 * Create a retry version of a step with sudo enabled.
 */
export function createRetryStep(step: TaskStep): TaskStep {
  if (step.toolCall.name !== "cmd_execute") {
    return step;
  }

  return {
    ...step,
    id: `${step.id}-retry`,
    description: `${step.description} (with sudo)`,
    toolCall: {
      ...step.toolCall,
      arguments: {
        ...step.toolCall.arguments,
        useSudo: true,
      },
    },
  };
}
