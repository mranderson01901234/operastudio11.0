# System Context Automation Plan

**Goal:** Automatically provide system context to LLM for all users without manual intervention

**Approach:** Collect system info when MCP session starts, store it, and automatically include in LLM system messages

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ 1. MCP Session Starts                                       │
│    ↓                                                        │
│ 2. Collect System Info (OS, paths, user, cwd)              │
│    ↓                                                        │
│ 3. Store in Database (LocalSession.systemInfo JSON)         │
│    ↓                                                        │
│ 4. Frontend: Fetch System Info when MCP Connected          │
│    ↓                                                        │
│ 5. Automatically Include in System Message to LLM          │
│    ↓                                                        │
│ 6. LLM Has Full System Context Immediately                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### **Phase 1: System Info Collection (Backend)**

#### **Step 1.1: Add System Info Collection Function**

**File:** `lib/mcp/system-info.ts` (NEW)

```typescript
import * as os from "os";
import * as path from "path";

export interface SystemInfo {
  os: {
    platform: string; // "linux", "darwin", "win32"
    arch: string;      // "x64", "arm64", etc.
    version?: string;   // Kernel version (Linux), macOS version, etc.
    hostname: string;
  };
  user: {
    homeDirectory: string;
    username: string;
    shell?: string;
  };
  environment: {
    path: string;      // PATH environment variable
    cwd: string;       // Current working directory
    nodeVersion: string;
  };
  workspace?: {
    root?: string;     // If we can detect workspace root
  };
}

/**
 * Collect system information from Node.js process
 * This runs on the backend server where MCP process is spawned
 */
export function collectSystemInfo(): SystemInfo {
  const platform = os.platform();
  const homeDir = os.homedir();
  const username = os.userInfo().username;
  const hostname = os.hostname();
  const cwd = process.cwd();
  const pathEnv = process.env.PATH || "";
  const shell = process.env.SHELL || process.env.COMSPEC || "";

  // Get OS version
  let osVersion: string | undefined;
  if (platform === "linux") {
    // Try to get kernel version
    try {
      const { execSync } = require("child_process");
      osVersion = execSync("uname -r").toString().trim();
    } catch {
      // Fallback to release info
      osVersion = os.release();
    }
  } else {
    osVersion = os.release();
  }

  return {
    os: {
      platform,
      arch: process.arch,
      version: osVersion,
      hostname,
    },
    user: {
      homeDirectory: homeDir,
      username,
      shell,
    },
    environment: {
      path: pathEnv,
      cwd,
      nodeVersion: process.version,
    },
  };
}
```

#### **Step 1.2: Store System Info in Database**

**Option A: Add JSON field to LocalSession** (Recommended - Simple)

**Migration:** Add `systemInfo` JSON field to `local_sessions` table

```sql
ALTER TABLE local_sessions 
ADD COLUMN system_info JSONB;
```

**Update Prisma Schema:**

```prisma
model LocalSession {
  // ... existing fields
  systemInfo Json? @map("system_info")
}
```

**Option B: Separate SystemInfo Table** (More normalized, but more complex)

Only use if you need to query system info separately or have complex relationships.

#### **Step 1.3: Collect and Store on Session Start**

**File:** `app/api/mcp/start/route.ts`

**Modify:** After creating session, collect and store system info

```typescript
import { collectSystemInfo } from "@/lib/mcp/system-info";

// In POST handler, after creating session:
const systemInfo = collectSystemInfo();

// Update session with system info
await prisma.localSession.update({
  where: { id: session.id },
  data: {
    systemInfo: systemInfo as any, // Prisma JSON type
  },
});
```

---

### **Phase 2: System Info API Endpoint**

#### **Step 2.1: Create System Info Endpoint**

**File:** `app/api/system/info/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/system/info
 * 
 * Returns system information for the user's active MCP session
 * 
 * Auth: Clerk session required
 * Output: SystemInfo JSON
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find active session
    const session = await prisma.localSession.findFirst({
      where: {
        userId,
        status: "ACTIVE",
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "No active MCP session found" },
        { status: 404 }
      );
    }

    // Return system info if available
    if (session.systemInfo) {
      return NextResponse.json(session.systemInfo);
    }

    // Fallback: Return basic info if systemInfo not collected yet
    // (for backwards compatibility with existing sessions)
    return NextResponse.json({
      error: "System info not available for this session",
      message: "Please restart your MCP session to collect system information",
    });
  } catch (error) {
    console.error("Error fetching system info:", error);
    return NextResponse.json(
      { error: "Failed to fetch system info" },
      { status: 500 }
    );
  }
}
```

---

### **Phase 3: Frontend Integration**

#### **Step 3.1: Create System Context Hook**

**File:** `hooks/use-system-info.ts` (NEW)

```typescript
import { useState, useEffect } from "react";

export interface SystemInfo {
  os: {
    platform: string;
    arch: string;
    version?: string;
    hostname: string;
  };
  user: {
    homeDirectory: string;
    username: string;
    shell?: string;
  };
  environment: {
    path: string;
    cwd: string;
    nodeVersion: string;
  };
  workspace?: {
    root?: string;
  };
}

export function useSystemInfo(sessionStatus: string) {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "connected") {
      setSystemInfo(null);
      return;
    }

    // Fetch system info when session is connected
    setLoading(true);
    setError(null);

    fetch("/api/system/info")
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            // No active session - this is OK
            return null;
          }
          throw new Error(`Failed to fetch system info: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data && !data.error) {
          setSystemInfo(data);
        } else {
          setSystemInfo(null);
        }
      })
      .catch((err) => {
        console.error("Error fetching system info:", err);
        setError(err.message);
        setSystemInfo(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionStatus]);

  return { systemInfo, loading, error };
}
```

#### **Step 3.2: Build System Context Message**

**File:** `components/chat/chat-interface.tsx`

**Add function:** `buildSystemContextMessage()`

```typescript
/**
 * Builds a system message containing system environment information.
 * This provides the LLM with full context about the user's system.
 */
function buildSystemContextMessage(systemInfo: SystemInfo | null): string {
  if (!systemInfo) {
    return "";
  }

  const parts: string[] = [];
  
  parts.push("🖥️ SYSTEM ENVIRONMENT:");
  parts.push("");
  
  // OS Information
  parts.push("Operating System:");
  parts.push(`- Platform: ${systemInfo.os.platform}`);
  parts.push(`- Architecture: ${systemInfo.os.arch}`);
  if (systemInfo.os.version) {
    parts.push(`- Version: ${systemInfo.os.version}`);
  }
  parts.push(`- Hostname: ${systemInfo.os.hostname}`);
  parts.push("");
  
  // User Information
  parts.push("User Environment:");
  parts.push(`- Username: ${systemInfo.user.username}`);
  parts.push(`- Home Directory: ${systemInfo.user.homeDirectory}`);
  if (systemInfo.user.shell) {
    parts.push(`- Shell: ${systemInfo.user.shell}`);
  }
  parts.push(`- Current Working Directory: ${systemInfo.environment.cwd}`);
  parts.push("");
  
  // Environment Variables
  parts.push("Environment:");
  parts.push(`- PATH: ${systemInfo.environment.path}`);
  parts.push(`- Node.js Version: ${systemInfo.environment.nodeVersion}`);
  parts.push("");
  
  // Path Resolution Instructions
  parts.push("PATH RESOLUTION RULES:");
  parts.push(`- Home directory (~): ${systemInfo.user.homeDirectory}`);
  parts.push(`- Default working directory: ${systemInfo.environment.cwd}`);
  parts.push(`- When user says "here" or "current directory", use: ${systemInfo.environment.cwd}`);
  parts.push(`- When user says "home", use: ${systemInfo.user.homeDirectory}`);
  parts.push("");
  
  // OS-Specific Instructions
  if (systemInfo.os.platform === "linux") {
    parts.push("Linux-Specific:");
    parts.push("- Common package managers: apt (Debian/Ubuntu), snap (modern apps), yum/dnf (RHEL/Fedora)");
    parts.push("- Common binary locations: /usr/bin, /usr/local/bin, /snap/bin, ~/.local/bin");
    parts.push("- Use 'which <command>' to find executables in PATH");
    parts.push("- Use 'snap list' to see installed snap packages");
  } else if (systemInfo.os.platform === "darwin") {
    parts.push("macOS-Specific:");
    parts.push("- Common package managers: brew (Homebrew), port (MacPorts)");
    parts.push("- Common binary locations: /usr/local/bin, /opt/homebrew/bin, ~/.local/bin");
    parts.push("- Use 'which <command>' to find executables in PATH");
  } else if (systemInfo.os.platform === "win32") {
    parts.push("Windows-Specific:");
    parts.push("- Use PowerShell or CMD commands");
    parts.push("- Path separator: \\ (backslash)");
    parts.push("- Common locations: C:\\Program Files, C:\\Users\\<username>");
  }
  
  parts.push("");
  parts.push("⚠️ IMPORTANT: Use the exact paths provided above. Do not guess or infer paths.");
  parts.push("When the user references a location, resolve it using the information above.");

  return parts.join("\n");
}
```

#### **Step 3.3: Integrate into Chat Interface**

**File:** `components/chat/chat-interface.tsx`

**Modify:** `sendMessage()` function to include system context

```typescript
import { useSystemInfo } from "@/hooks/use-system-info";

// In ChatInterface component:
const { systemInfo } = useSystemInfo(sessionStatus);

// In sendMessage function, before sending payload:
const systemContextMessage = buildSystemContextMessage(systemInfo);
if (systemContextMessage) {
  payload.unshift({
    role: "system",
    content: systemContextMessage,
  });
}
```

**Order of System Messages:**
1. System Context (OS, paths, environment) - **NEW**
2. Tool Capabilities (what tools are available)
3. File Context (open files)

---

### **Phase 4: Enhanced System Info (Optional - Future)**

#### **Step 4.1: Workspace Detection**

Detect workspace root from open files or current directory:

```typescript
function detectWorkspaceRoot(openFiles: Map<string, FileState>, cwd: string): string | undefined {
  if (openFiles.size === 0) {
    return cwd;
  }
  
  // Find common root of all open files
  const paths = Array.from(openFiles.keys());
  // ... logic to find common root
  
  return commonRoot;
}
```

#### **Step 4.2: Installed Software Discovery** (Optional)

Query installed software via MCP tools and cache:

```typescript
// In system-info collection, optionally run discovery commands
async function discoverInstalledSoftware(): Promise<{
  snap?: string[];
  apt?: string[];
  brew?: string[];
}> {
  // Run discovery commands via MCP if available
  // Cache results in systemInfo
}
```

**Note:** This is optional because:
- Can be slow (multiple commands)
- May require elevated permissions
- LLM can discover on-demand via tools
- Better to let LLM query when needed than pre-fetch everything

---

## Database Migration

### **Migration File:** `prisma/migrations/XXXXXX_add_system_info/migration.sql`

```sql
-- Add system_info JSONB column to local_sessions
ALTER TABLE local_sessions 
ADD COLUMN system_info JSONB;

-- Add index for querying (optional, if you need to query by OS/platform)
CREATE INDEX idx_local_sessions_system_info ON local_sessions USING GIN (system_info);
```

### **Update Prisma Schema**

```prisma
model LocalSession {
  id              String        @id @default(uuid())
  deviceId        String        @map("device_id")
  userId          String        @map("user_id")
  sessionSecret   String        @map("session_secret") @db.Text
  mcpPort         Int           @map("mcp_port")
  mode            SessionMode?
  durationMinutes Int?          @map("duration_minutes")
  status          SessionStatus @default(ACTIVE)
  startedAt       DateTime      @map("started_at")
  endedAt         DateTime?     @map("ended_at")
  systemInfo      Json?         @map("system_info")  // NEW FIELD
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  device   Device    @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  toolRuns ToolRun[]

  @@index([deviceId])
  @@index([userId])
  @@index([status])
  @@map("local_sessions")
}
```

---

## Benefits of This Approach

### ✅ **Scalability**
- Works for all users automatically
- No manual configuration needed
- Each user gets their own system info

### ✅ **Performance**
- System info collected once per session
- Cached in database
- No repeated discovery commands

### ✅ **Accuracy**
- Real system data, not assumptions
- OS-specific information
- Actual paths, not inferred

### ✅ **Maintainability**
- Centralized system info collection
- Easy to extend with more info
- Backwards compatible (graceful fallback)

### ✅ **Privacy**
- System info stored per-user
- Only accessible to that user
- No cross-user data leakage

---

## Testing Checklist

- [ ] System info collected when MCP session starts
- [ ] System info stored in database
- [ ] API endpoint returns system info for active session
- [ ] Frontend hook fetches system info when connected
- [ ] System context message includes all relevant info
- [ ] System context automatically included in LLM messages
- [ ] Works on Linux (various distributions)
- [ ] Works on macOS
- [ ] Works on Windows
- [ ] Handles missing system info gracefully (backwards compatibility)
- [ ] Multiple users can have different system info simultaneously

---

## Rollout Strategy

### **Phase 1: Backend (Week 1)**
1. Create `lib/mcp/system-info.ts`
2. Add database migration
3. Update MCP start route to collect system info
4. Create `/api/system/info` endpoint
5. Test with manual API calls

### **Phase 2: Frontend (Week 1)**
1. Create `hooks/use-system-info.ts`
2. Create `buildSystemContextMessage()` function
3. Integrate into chat interface
4. Test system context appears in messages

### **Phase 3: Testing (Week 2)**
1. Test on Linux (Ubuntu, Debian, Fedora)
2. Test on macOS
3. Test on Windows
4. Test with multiple concurrent users
5. Verify LLM receives correct system info

### **Phase 4: Monitoring (Ongoing)**
1. Monitor system info collection errors
2. Track API endpoint usage
3. Verify system info accuracy
4. Collect user feedback on LLM responses

---

## Future Enhancements

1. **Workspace Detection**: Automatically detect project root from open files
2. **Software Inventory**: Optional pre-discovery of installed software
3. **System Resources**: Add memory, disk space info
4. **Network Status**: Add network connectivity info
5. **Environment Variables**: Include relevant env vars (if safe)
6. **Update on Change**: Refresh system info if cwd changes significantly

---

## Example Output

### **System Context Message (Linux)**

```
🖥️ SYSTEM ENVIRONMENT:

Operating System:
- Platform: linux
- Architecture: x64
- Version: 6.14.0-35-generic
- Hostname: dp-desktop

User Environment:
- Username: dp
- Home Directory: /home/dp
- Shell: /usr/bin/bash
- Current Working Directory: /home/dp/Desktop/operastudio-11.0

Environment:
- PATH: /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin
- Node.js Version: v20.10.0

PATH RESOLUTION RULES:
- Home directory (~): /home/dp
- Default working directory: /home/dp/Desktop/operastudio-11.0
- When user says "here" or "current directory", use: /home/dp/Desktop/operastudio-11.0
- When user says "home", use: /home/dp

Linux-Specific:
- Common package managers: apt (Debian/Ubuntu), snap (modern apps), yum/dnf (RHEL/Fedora)
- Common binary locations: /usr/bin, /usr/local/bin, /snap/bin, ~/.local/bin
- Use 'which <command>' to find executables in PATH
- Use 'snap list' to see installed snap packages

⚠️ IMPORTANT: Use the exact paths provided above. Do not guess or infer paths.
When the user references a location, resolve it using the information above.
```

---

## Conclusion

This automated approach provides system context to the LLM for all users without manual intervention. It's scalable, performant, and works across all operating systems. The system info is collected once per session and automatically included in every LLM interaction, eliminating the need for discovery commands and improving response accuracy.

