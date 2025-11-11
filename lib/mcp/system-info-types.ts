/**
 * Shared TypeScript types for system information
 * This file contains only types (no runtime code) so it can be imported
 * from both server-side and client-side code.
 */

// Re-export comprehensive discovery types
export type {
  ComprehensiveSoftwareInventory,
  FileSystemIndex,
  DirectoryNode,
  ProjectInfo,
  ImportantFile,
  RunningState,
  EnvironmentContext,
} from "./comprehensive-discovery";

// Legacy type for backwards compatibility
export interface InstalledSoftware {
  browsers: string[];
  packageManagers: {
    snap?: string[];
    apt?: string[];
    brew?: string[];
  };
  commonTools: string[];
}

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
  
  // Legacy software discovery (for backwards compatibility)
  installedSoftware?: InstalledSoftware;
  
  // Comprehensive system information (NEW - complete view)
  software?: ComprehensiveSoftwareInventory;
  fileSystem?: FileSystemIndex;
  projects?: {
    current?: ProjectInfo;
    all: ProjectInfo[];
  };
  running?: RunningState;
  config?: EnvironmentContext;
  
  workspace?: {
    root?: string;     // If we can detect workspace root
  };
  
  // Metadata
  indexedAt?: string;
  indexVersion?: string;
}

