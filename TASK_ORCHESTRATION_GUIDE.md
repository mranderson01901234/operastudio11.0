# Task Orchestration Implementation Guide

## Overview

This guide explains the new **Task Orchestration System** that enables enterprise-grade sequential task execution with real-time progress tracking and command output streaming.

## Architecture

```
┌─────────────────┐
│   User Request  │  "Install VirtualBox"
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│    Task Planner                 │  Creates structured task plan
│  lib/chat/task-planner.ts      │  • Step 1: apt update
│                                 │  • Step 2: apt install virtualbox
│                                 │  • Step 3: virtualbox --version
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│    Task Executor                │  Executes steps sequentially
│  lib/chat/task-executor.ts     │  • Auto-retry with sudo
│                                 │  • Error handling
│                                 │  • Progress callbacks
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Command Stream API             │  Streams output in real-time
│  /api/mcp/stream-command        │  • Server-Sent Events (SSE)
│                                 │  • Live stdout/stderr
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│    UI Components                │  Shows progress to user
│  TaskProgressPanel              │  • Step-by-step status
│  CommandOutputStream            │  • Live terminal output
└─────────────────────────────────┘
```

## New Files Created

### 1. **lib/chat/task-planner.ts**

**Purpose:** Types and utilities for structured task planning

**Key Types:**
```typescript
interface TaskStep {
  id: string;
  description: string;           // "Update package lists"
  toolCall: ToolCall;            // Actual tool to execute
  critical: boolean;             // Abort if fails?
  retryable: boolean;            // Auto-retry with sudo?
  validation?: Partial<ToolCall>; // Optional verification step
}

interface TaskPlan {
  goal: string;                  // "Install VirtualBox"
  steps: TaskStep[];
  currentStep: number;
}
```

**Key Functions:**
- `parseTaskPlan(llmResponse)` - Extract JSON task plan from LLM
- `createSequentialPlan(goal, toolCalls)` - Create plan from tool calls
- `shouldRetryStep(step, error)` - Check if step should be retried
- `createRetryStep(step)` - Create retry version with sudo

---

### 2. **lib/chat/task-executor.ts**

**Purpose:** Execute multi-step tasks with progress tracking

**Key Class:**
```typescript
class TaskExecutor {
  constructor(userId: string, onProgress?: ProgressCallback)

  async execute(plan: TaskPlan): Promise<TaskExecutionResult>
}
```

**Features:**
- ✅ Sequential execution with progress callbacks
- ✅ Automatic retry on permission errors (with sudo)
- ✅ Validation step execution
- ✅ Critical vs non-critical step handling
- ✅ Detailed error reporting

**Example Usage:**
```typescript
import { executeTaskPlan } from '@/lib/chat/task-executor';

const plan: TaskPlan = {
  goal: "Install VirtualBox",
  steps: [
    {
      id: "1",
      description: "Update package lists",
      toolCall: {
        id: "tool-1",
        name: "cmd_execute",
        arguments: { command: "apt", args: ["update"], useSudo: true }
      },
      critical: true,
      retryable: true
    },
    // ... more steps
  ],
  currentStep: 0
};

const result = await executeTaskPlan(
  plan,
  userId,
  (progress) => {
    console.log(`Step ${progress.stepIndex + 1}: ${progress.description}`);
    console.log(`Status: ${progress.status}`);
  }
);

if (result.status === "success") {
  console.log("All steps completed!");
}
```

---

### 3. **app/api/mcp/stream-command/route.ts**

**Purpose:** Stream command output in real-time using Server-Sent Events

**Endpoint:** `POST /api/mcp/stream-command`

**Request Body:**
```json
{
  "command": "apt",
  "args": ["install", "-y", "virtualbox"],
  "useSudo": true,
  "sessionId": "session-id-123"
}
```

**Response:** Server-Sent Events stream

**Event Types:**
```typescript
// stdout event
data: {"type":"stdout","data":"Reading package lists...\n"}

// stderr event
data: {"type":"stderr","data":"Warning: some message\n"}

// exit event
data: {"type":"exit","exitCode":0}

// error event
data: {"type":"error","error":"Permission denied"}

// completion marker
data: [DONE]
```

**Security:**
- ✅ Clerk authentication required
- ✅ Active filesystem session verification
- ✅ Safe mode restrictions enforced
- ✅ 5-minute timeout for long-running commands

---

### 4. **components/chat/task-progress-panel.tsx**

**Purpose:** UI component showing multi-step task progress

**Props:**
```typescript
interface TaskProgressPanelProps {
  goal: string;                     // "Install VirtualBox"
  steps: TaskExecutionProgress[];   // Array of step progress
  currentStepIndex?: number;        // Currently executing step
}
```

**Features:**
- ✅ Overall progress bar
- ✅ Step-by-step status icons (spinner, checkmark, error)
- ✅ Expandable output for each step
- ✅ Completed/total step counter
- ✅ Color-coded status indicators

**Example Usage:**
```tsx
<TaskProgressPanel
  goal="Install VirtualBox"
  steps={progressSteps}
  currentStepIndex={2}
/>
```

---

### 5. **components/chat/command-output-stream.tsx**

**Purpose:** Real-time terminal output display

**Props:**
```typescript
interface CommandOutputStreamProps {
  command: string;              // "apt"
  args: string[];              // ["install", "virtualbox"]
  sessionId: string;           // User's session ID
  useSudo?: boolean;           // Run with sudo?
  onComplete?: (exitCode: number) => void;
  onError?: (error: string) => void;
}
```

**Features:**
- ✅ Real-time output streaming (stdout/stderr)
- ✅ Auto-scrolling terminal display
- ✅ Success/failure status indicators
- ✅ Terminal-style formatting
- ✅ Error highlighting

**Example Usage:**
```tsx
<CommandOutputStream
  command="apt"
  args={["install", "-y", "virtualbox"]}
  sessionId={sessionId}
  useSudo={true}
  onComplete={(code) => {
    if (code === 0) {
      console.log("Installation succeeded!");
    }
  }}
/>
```

---

## Integration into Chat Interface

To integrate task orchestration into the chat interface, follow these steps:

### Step 1: Import Components and Functions

```typescript
// In components/chat/chat-interface.tsx
import { TaskProgressPanel } from "./task-progress-panel";
import { CommandOutputStream } from "./command-output-stream";
import { executeTaskPlan, TaskExecutionProgress } from "@/lib/chat/task-executor";
import { TaskPlan, createSequentialPlan } from "@/lib/chat/task-planner";
```

### Step 2: Add State Management

```typescript
// Add to chat interface state
const [activeTasks, setActiveTasks] = useState<Map<string, {
  plan: TaskPlan;
  progress: TaskExecutionProgress[];
}>>(new Map());
```

### Step 3: Detect Multi-Step Tool Calls

```typescript
// When LLM makes multiple tool calls in response
if (functionCalls.length > 1) {
  // Create a task plan from the tool calls
  const plan = createSequentialPlan(
    "Multi-step operation", // Or extract from context
    functionCalls.map(fc => ({
      id: fc.id,
      name: fc.name,
      arguments: fc.arguments
    }))
  );

  // Execute the plan
  const taskId = `task-${Date.now()}`;
  setActiveTasks(prev => new Map(prev).set(taskId, {
    plan,
    progress: []
  }));

  // Execute with progress updates
  const result = await executeTaskPlan(
    plan,
    userId,
    (progress) => {
      setActiveTasks(prev => {
        const task = prev.get(taskId);
        if (!task) return prev;

        const updated = new Map(prev);
        updated.set(taskId, {
          ...task,
          progress: [...task.progress, progress]
        });
        return updated;
      });
    }
  );

  // Handle completion
  if (result.status === "success") {
    console.log("All steps completed!");
  }
}
```

### Step 4: Render Progress UI

```typescript
// In the message rendering section
{message.role === "assistant" && activeTasks.has(message.id) && (
  const task = activeTasks.get(message.id)!;
  <TaskProgressPanel
    goal={task.plan.goal}
    steps={task.progress}
  />
)}
```

---

## Example: Complete VirtualBox Installation Flow

```typescript
// 1. User sends: "Install VirtualBox"

// 2. LLM responds with task plan (in system prompt)
const plan: TaskPlan = {
  goal: "Install VirtualBox",
  steps: [
    {
      id: "step-1",
      description: "Update package lists",
      toolCall: {
        id: "tool-1",
        name: "cmd_execute",
        arguments: { command: "apt", args: ["update"], useSudo: true }
      },
      critical: true,
      retryable: true
    },
    {
      id: "step-2",
      description: "Install VirtualBox",
      toolCall: {
        id: "tool-2",
        name: "cmd_execute",
        arguments: { command: "apt", args: ["install", "-y", "virtualbox"], useSudo: true }
      },
      critical: true,
      retryable: true
    },
    {
      id: "step-3",
      description: "Verify installation",
      toolCall: {
        id: "tool-3",
        name: "cmd_execute",
        arguments: { command: "virtualbox", args: ["--version"] }
      },
      critical: false,
      retryable: false
    }
  ],
  currentStep: 0
};

// 3. Task executor runs each step sequentially
// 4. Progress callbacks update UI in real-time
// 5. Final message: "✅ VirtualBox 7.0.12 installed successfully"
```

---

## Benefits

### Before Task Orchestration:
- ❌ LLM calls one tool, waits for response, calls API again
- ❌ 3 separate API calls for 3-step task (slow, expensive)
- ❌ No visibility into progress
- ❌ Manual retry on permission errors
- ❌ Stops prematurely on minor errors

### After Task Orchestration:
- ✅ All steps planned upfront
- ✅ Local execution with single API call
- ✅ Real-time progress updates
- ✅ Automatic retry with sudo
- ✅ Continues through non-critical failures
- ✅ Validation steps ensure success

---

## Testing

To test the system:

```bash
# 1. Start the dev server
npm run dev

# 2. Connect to File System (Balanced or Unrestricted mode)

# 3. Try these test commands:
"Install VirtualBox"
"Download and install Opera browser"
"Update system packages and install git"
```

Expected behavior:
- See TaskProgressPanel with all steps
- Live terminal output for each command
- Auto-retry with sudo if permission denied
- Final verification step confirms success

---

## Next Steps

1. **Test the system** with VirtualBox installation
2. **Monitor performance** and token usage
3. **Iterate on UI** based on user feedback
4. **Expand to other task types** (file operations, git workflows, etc.)

---

## Notes

- Task orchestration reduces API calls by ~66% for multi-step tasks
- Automatic sudo retry improves success rate significantly
- Real-time progress improves user confidence
- Structured task plans make LLM behavior predictable
