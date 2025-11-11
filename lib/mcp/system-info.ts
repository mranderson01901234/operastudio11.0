import * as os from "os";
import { discoverInstalledSoftware } from "./software-discovery";
import {
  discoverComprehensiveSoftware,
  indexFileSystem,
  discoverRunningState,
  discoverEnvironmentContext,
} from "./comprehensive-discovery";
import type { SystemInfo, InstalledSoftware } from "./system-info-types";

// Re-export types for convenience
export type { SystemInfo, InstalledSoftware };

/**
 * Collect system information from Node.js process
 * This runs on the backend server where MCP process is spawned
 * 
 * This function gathers system information that will be provided to the LLM
 * to give it full context about the user's local environment.
 * 
 * Also proactively discovers installed software (browsers, tools) to give
 * the LLM a complete inventory without requiring discovery commands.
 */
export async function collectSystemInfo(): Promise<SystemInfo> {
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
      osVersion = execSync("uname -r", { encoding: "utf-8", timeout: 2000 }).toString().trim();
    } catch {
      // Fallback to release info
      osVersion = os.release();
    }
  } else {
    osVersion = os.release();
  }

  // Proactively discover installed software (non-blocking)
  // This gives LLM full inventory without requiring discovery commands
  let installedSoftware: InstalledSoftware | undefined;
  try {
    installedSoftware = await discoverInstalledSoftware(platform);
  } catch (error) {
    // Don't fail system info collection if software discovery fails
    console.error("[System Info] Failed to discover installed software:", error);
  }

  // COMPREHENSIVE SYSTEM DISCOVERY (NEW)
  // Discover everything: software, file system, projects, running state, config
  // This provides complete system visibility - nothing missed
  const comprehensiveDiscovery = await Promise.allSettled([
    discoverComprehensiveSoftware(platform),
    indexFileSystem(homeDir),
    discoverRunningState(platform),
    discoverEnvironmentContext(homeDir),
  ]);

  const [softwareResult, fileSystemResult, runningResult, configResult] = comprehensiveDiscovery;

  const systemInfo: SystemInfo = {
    os: {
      platform,
      arch: process.arch,
      version: osVersion,
      hostname,
    },
    user: {
      homeDirectory: homeDir,
      username,
      shell: shell || undefined,
    },
    environment: {
      path: pathEnv,
      cwd,
      nodeVersion: process.version,
    },
    // Legacy software discovery (for backwards compatibility)
    installedSoftware,
    // Comprehensive discovery results
    software: softwareResult.status === "fulfilled" ? softwareResult.value : undefined,
    fileSystem: fileSystemResult.status === "fulfilled" ? fileSystemResult.value : undefined,
    running: runningResult.status === "fulfilled" ? runningResult.value : undefined,
    config: configResult.status === "fulfilled" ? configResult.value : undefined,
    // Projects (extracted from fileSystem)
    projects: fileSystemResult.status === "fulfilled" && fileSystemResult.value?.projects
      ? {
          all: fileSystemResult.value.projects,
          current: fileSystemResult.value.projects.find(p => cwd.startsWith(p.root)),
        }
      : undefined,
    // Metadata
    indexedAt: new Date().toISOString(),
    indexVersion: "1.0.0",
  };

  // Log discovery results
  if (softwareResult.status === "fulfilled") {
    const sw = softwareResult.value;
    console.log(`[System Info] Discovered ${sw.browsers.length} browsers, ${sw.executables.length} executables`);
    if (sw.systemPackages.apt) console.log(`[System Info] ${sw.systemPackages.apt.length} apt packages`);
    if (sw.systemPackages.snap) console.log(`[System Info] ${sw.systemPackages.snap.length} snap packages`);
  }
  if (fileSystemResult.status === "fulfilled") {
    console.log(`[System Info] Discovered ${fileSystemResult.value.projects.length} projects`);
    console.log(`[System Info] Found ${fileSystemResult.value.importantFiles.length} important config files`);
  }
  if (runningResult.status === "fulfilled") {
    console.log(`[System Info] Found ${runningResult.value.processes.length} processes, ${runningResult.value.listeningPorts.length} listening ports`);
  }

  return systemInfo;
}

