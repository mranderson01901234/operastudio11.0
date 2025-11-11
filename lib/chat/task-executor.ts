/**
 * Task Executor
 *
 * Executes multi-step task plans with progress tracking, error handling, and auto-retry.
 * This reduces the number of round-trips to the LLM by executing sequences locally.
 */

import {
  TaskPlan,
  TaskStep,
  TaskExecutionProgress,
  TaskExecutionResult,
  shouldRetryStep,
  createRetryStep,
} from "./task-planner";
import { executeToolCall, ToolCall, ToolResult } from "./tool-handler";

export type ProgressCallback = (progress: TaskExecutionProgress) => void;

export class TaskExecutor {
  private userId: string;
  private onProgress?: ProgressCallback;

  constructor(userId: string, onProgress?: ProgressCallback) {
    this.userId = userId;
    this.onProgress = onProgress;
  }

  /**
   * Execute a complete task plan with automatic error handling and retry.
   */
  async execute(plan: TaskPlan): Promise<TaskExecutionResult> {
    const progressList: TaskExecutionProgress[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const stepIndex = i;

      // Execute the step
      const progress = await this.executeStep(step, stepIndex, plan.steps.length);
      progressList.push(progress);

      // Emit progress update
      if (this.onProgress) {
        this.onProgress(progress);
      }

      // Handle step failure
      if (progress.status === "failed") {
        // Check if we should retry with sudo
        if (progress.error && shouldRetryStep(step, progress.error)) {
          console.log(`[Task Executor] Retrying step ${step.id} with sudo`);

          const retryStep = createRetryStep(step);
          const retryProgress = await this.executeStep(
            retryStep,
            stepIndex,
            plan.steps.length
          );

          progressList.push(retryProgress);

          if (this.onProgress) {
            this.onProgress(retryProgress);
          }

          // If retry succeeded, continue
          if (retryProgress.status === "completed") {
            continue;
          }

          // Retry also failed
          if (step.critical) {
            return {
              status: "failed",
              steps: progressList,
              failedStep: step,
              error: retryProgress.error || "Step failed after retry",
            };
          }

          // Non-critical step failed, continue
          continue;
        }

        // No retry, check if critical
        if (step.critical) {
          return {
            status: "failed",
            steps: progressList,
            failedStep: step,
            error: progress.error || "Critical step failed",
          };
        }

        // Non-critical step failed, continue
        continue;
      }

      // Step succeeded, run validation if present
      if (step.validation) {
        const validationCall: ToolCall = {
          id: `${step.id}-validation`,
          name: step.validation.name || "cmd_execute",
          arguments: step.validation.arguments || {},
        };

        const validationProgress = await this.executeValidation(
          validationCall,
          step,
          stepIndex,
          plan.steps.length
        );

        progressList.push(validationProgress);

        if (this.onProgress) {
          this.onProgress(validationProgress);
        }
      }
    }

    // All steps completed
    const completedCount = progressList.filter((p) => p.status === "completed").length;

    if (completedCount === plan.steps.length) {
      return {
        status: "success",
        steps: progressList,
      };
    }

    return {
      status: "partial",
      steps: progressList,
      completedCount,
    };
  }

  /**
   * Execute a single step.
   */
  private async executeStep(
    step: TaskStep,
    stepIndex: number,
    totalSteps: number
  ): Promise<TaskExecutionProgress> {
    const progress: TaskExecutionProgress = {
      stepId: step.id,
      stepIndex,
      totalSteps,
      status: "executing",
      description: step.description,
    };

    // Emit executing status
    if (this.onProgress) {
      this.onProgress(progress);
    }

    try {
      // Execute the tool call
      const result: ToolResult = await executeToolCall(step.toolCall, 0, this.userId);

      if (result.error) {
        return {
          ...progress,
          status: "failed",
          error: result.error,
        };
      }

      // Format output for display
      const output = this.formatToolOutput(result);

      return {
        ...progress,
        status: "completed",
        output,
      };
    } catch (error) {
      return {
        ...progress,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Execute a validation step.
   */
  private async executeValidation(
    validationCall: ToolCall,
    originalStep: TaskStep,
    stepIndex: number,
    totalSteps: number
  ): Promise<TaskExecutionProgress> {
    const progress: TaskExecutionProgress = {
      stepId: `${originalStep.id}-validation`,
      stepIndex,
      totalSteps,
      status: "executing",
      description: `Verifying: ${originalStep.description}`,
    };

    try {
      const result = await executeToolCall(validationCall, 0, this.userId);

      if (result.error) {
        return {
          ...progress,
          status: "failed",
          error: `Validation failed: ${result.error}`,
        };
      }

      const output = this.formatToolOutput(result);

      return {
        ...progress,
        status: "completed",
        output,
      };
    } catch (error) {
      return {
        ...progress,
        status: "failed",
        error: `Validation error: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  }

  /**
   * Format tool output for display.
   */
  private formatToolOutput(result: ToolResult): string {
    if (typeof result.result === "string") {
      return result.result;
    }

    if (result.name === "cmd_execute" && result.result && typeof result.result === "object") {
      const cmdResult = result.result as { stdout?: string; stderr?: string; exitCode?: number };

      if (cmdResult.exitCode === 0) {
        return cmdResult.stdout || "✓ Command completed successfully";
      }

      return cmdResult.stderr || cmdResult.stdout || "Command failed";
    }

    // Generic formatting
    return JSON.stringify(result.result, null, 2);
  }
}

/**
 * Convenience function to execute a task plan.
 */
export async function executeTaskPlan(
  plan: TaskPlan,
  userId: string,
  onProgress?: ProgressCallback
): Promise<TaskExecutionResult> {
  const executor = new TaskExecutor(userId, onProgress);
  return executor.execute(plan);
}
