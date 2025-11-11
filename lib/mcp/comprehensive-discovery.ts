/**
 * Comprehensive System Discovery
 * 
 * This module provides complete discovery of the user's local environment:
 * - All installed software (system packages, languages, tools)
 * - File system structure
 * - Projects and workspaces
 * - Running processes and services
 * - Environment configuration
 * 
 * Goal: Leave NO gaps - discover everything the LLM needs to know
 */

import { promisify } from "util";
import { exec } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// ============================================================================
// TYPES
// ============================================================================

export interface ComprehensiveSoftwareInventory {
  // System Packages
  systemPackages: {
    apt?: Array<{ name: string; version: string; description?: string }>;
    snap?: Array<{ name: string; version: string; revision?: string }>;
    brew?: Array<{ name: string; version: string; cask?: boolean }>;
    yum?: Array<{ name: string; version: string }>;
    pacman?: Array<{ name: string; version: string }>;
  };
  
  // Development Languages & Runtimes
  languages: {
    node?: Array<{ version: string; path: string }>;
    python?: Array<{ version: string; path: string }>;
    java?: Array<{ version: string; path: string }>;
    rust?: { version: string; path: string };
    go?: { version: string; path: string };
    ruby?: Array<{ version: string; path: string }>;
  };
  
  // Package Managers
  packageManagers: {
    npm?: { version: string; globalPackages?: string[] };
    pip?: { version: string; globalPackages?: string[] };
    cargo?: { version: string };
    composer?: { version: string };
    yarn?: { version: string };
    pnpm?: { version: string };
  };
  
  // Development Tools
  developmentTools: {
    git?: { version: string; config?: Record<string, string> };
    docker?: { version: string; containers?: number };
    vscode?: { version: string; extensions?: string[] };
    editors?: Array<{ name: string; version?: string }>;
  };
  
  // All Executables in PATH
  executables: Array<{ name: string; path: string; type: 'system' | 'user' | 'snap' }>;
  
  // System Services
  services: Array<{ name: string; status: 'running' | 'stopped'; type: string }>;
  
  // Browsers (comprehensive)
  browsers: string[];
}

export interface FileSystemIndex {
  directoryTree: DirectoryNode;
  projects: ProjectInfo[];
  importantFiles: ImportantFile[];
}

export interface DirectoryNode {
  path: string;
  type: 'directory' | 'file';
  name: string;
  children?: DirectoryNode[];
  metadata?: {
    size?: number;
    mtime?: string;
    permissions?: string;
  };
}

export interface ProjectInfo {
  root: string;
  type: 'git' | 'node' | 'python' | 'rust' | 'go' | 'java' | 'unknown';
  name?: string;
  version?: string;
  gitInfo?: {
    remote?: string;
    branch?: string;
    status?: string;
  };
  packageInfo?: {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
  };
}

export interface ImportantFile {
  path: string;
  type: 'config' | 'package' | 'readme' | 'gitignore' | 'env' | 'dockerfile';
  content?: string;
}

export interface RunningState {
  processes: Array<{
    name: string;
    pid: number;
    command: string;
    cwd?: string;
    port?: number;
  }>;
  listeningPorts: Array<{
    port: number;
    protocol: string;
    process?: string;
  }>;
  containers: Array<{
    id: string;
    name: string;
    image: string;
    status: string;
  }>;
  devServers: Array<{
    type: 'node' | 'python' | 'rust' | 'other';
    port: number;
    path?: string;
  }>;
}

export interface EnvironmentContext {
  environmentVariables: Record<string, string>;
  shellConfig: {
    shell: string;
    configFile?: string;
    aliases?: Record<string, string>;
  };
  applicationConfigs: {
    git?: Record<string, string>;
    npm?: Record<string, string>;
  };
}

// ============================================================================
// COMPREHENSIVE SOFTWARE DISCOVERY
// ============================================================================

/**
 * Discover ALL installed software comprehensively
 */
export async function discoverComprehensiveSoftware(platform: string): Promise<ComprehensiveSoftwareInventory> {
  const inventory: ComprehensiveSoftwareInventory = {
    systemPackages: {},
    languages: {},
    packageManagers: {},
    developmentTools: {},
    executables: [],
    services: [],
    browsers: [],
  };

  // Run all discoveries in parallel for speed
  const discoveries = [
    discoverSystemPackages(platform, inventory),
    discoverLanguages(platform, inventory),
    discoverPackageManagers(platform, inventory),
    discoverDevelopmentTools(platform, inventory),
    discoverExecutables(platform, inventory),
    discoverServices(platform, inventory),
    discoverBrowsers(platform, inventory),
  ];

  await Promise.allSettled(discoveries);

  return inventory;
}

/**
 * Discover system packages from all package managers
 */
async function discoverSystemPackages(
  platform: string,
  inventory: ComprehensiveSoftwareInventory
): Promise<void> {
  if (platform === "linux") {
    // APT (Debian/Ubuntu)
    try {
      const { stdout } = await execAsync("dpkg-query -W -f='${Package}\t${Version}\t${Description}\n' 2>/dev/null | head -100", { timeout: 10000 });
      inventory.systemPackages.apt = stdout
        .split("\n")
        .filter(Boolean)
        .map(line => {
          const [name, version, ...descParts] = line.split("\t");
          return {
            name: name?.trim() || "",
            version: version?.trim() || "",
            description: descParts.join(" ").trim() || undefined,
          };
        })
        .filter(pkg => pkg.name);
    } catch {
      // APT not available
    }

    // Snap
    try {
      const { stdout } = await execAsync("snap list 2>/dev/null", { timeout: 5000 });
      inventory.systemPackages.snap = stdout
        .split("\n")
        .slice(1) // Skip header
        .filter(Boolean)
        .map(line => {
          const parts = line.split(/\s+/);
          return {
            name: parts[0] || "",
            version: parts[1] || "",
            revision: parts[2] || undefined,
          };
        })
        .filter(pkg => pkg.name);
    } catch {
      // Snap not available
    }

    // YUM/DNF (RHEL/Fedora)
    try {
      const { stdout } = await execAsync("rpm -qa --queryformat='%{NAME}\t%{VERSION}\n' 2>/dev/null | head -100", { timeout: 10000 });
      inventory.systemPackages.yum = stdout
        .split("\n")
        .filter(Boolean)
        .map(line => {
          const [name, version] = line.split("\t");
          return { name: name?.trim() || "", version: version?.trim() || "" };
        })
        .filter(pkg => pkg.name);
    } catch {
      // YUM not available
    }

    // Pacman (Arch)
    try {
      const { stdout } = await execAsync("pacman -Q 2>/dev/null | head -100", { timeout: 5000 });
      inventory.systemPackages.pacman = stdout
        .split("\n")
        .filter(Boolean)
        .map(line => {
          const [name, version] = line.split(" ");
          return { name: name?.trim() || "", version: version?.trim() || "" };
        })
        .filter(pkg => pkg.name);
    } catch {
      // Pacman not available
    }
  } else if (platform === "darwin") {
    // Homebrew
    try {
      const { stdout } = await execAsync("brew list --formula 2>/dev/null", { timeout: 10000 });
      const formulas = stdout.split("\n").filter(Boolean);
      const casks = await execAsync("brew list --cask 2>/dev/null", { timeout: 5000 })
        .then(r => r.stdout.split("\n").filter(Boolean))
        .catch(() => []);

      inventory.systemPackages.brew = [
        ...formulas.map(name => ({ name, version: "", cask: false })),
        ...casks.map(name => ({ name, version: "", cask: true })),
      ];
    } catch {
      // Homebrew not available
    }
  }
}

/**
 * Discover all installed language runtimes
 */
async function discoverLanguages(
  platform: string,
  inventory: ComprehensiveSoftwareInventory
): Promise<void> {
  // Node.js (including nvm versions)
  try {
    // System Node
    const { stdout: nodeVersion } = await execAsync("node --version 2>/dev/null", { timeout: 2000 });
    if (nodeVersion) {
      inventory.languages.node = [{
        version: nodeVersion.trim(),
        path: (await execAsync("which node", { timeout: 1000 })).stdout.trim(),
      }];
    }

    // NVM versions
    const nvmPath = path.join(os.homedir(), ".nvm");
    try {
      const nvmVersions = await fs.readdir(nvmPath);
      const nodeVersions = nvmVersions
        .filter(v => v.startsWith("v"))
        .map(version => ({
          version,
          path: path.join(nvmPath, version),
        }));
      inventory.languages.node = [
        ...(inventory.languages.node || []),
        ...nodeVersions,
      ];
    } catch {
      // NVM not installed or no versions
    }
  } catch {
    // Node not available
  }

  // Python (including pyenv versions)
  try {
    // System Python
    const pythonVersions: Array<{ version: string; path: string }> = [];
    
    for (const cmd of ["python3", "python"]) {
      try {
        const { stdout: version } = await execAsync(`${cmd} --version 2>/dev/null`, { timeout: 2000 });
        const { stdout: pythonPath } = await execAsync(`which ${cmd}`, { timeout: 1000 });
        if (version && pythonPath) {
          pythonVersions.push({
            version: version.trim(),
            path: pythonPath.trim(),
          });
        }
      } catch {
        // This Python version not available
      }
    }

    if (pythonVersions.length > 0) {
      inventory.languages.python = pythonVersions;
    }

    // Pyenv versions
    const pyenvPath = path.join(os.homedir(), ".pyenv", "versions");
    try {
      const pyenvVersions = await fs.readdir(pyenvPath);
      const pythonPyenvVersions = pyenvVersions.map(version => ({
        version,
        path: path.join(pyenvPath, version),
      }));
      inventory.languages.python = [
        ...(inventory.languages.python || []),
        ...pythonPyenvVersions,
      ];
    } catch {
      // Pyenv not installed
    }
  } catch {
    // Python discovery failed
  }

  // Java
  try {
    const { stdout: javaVersion } = await execAsync("java -version 2>&1 | head -1", { timeout: 2000 });
    if (javaVersion) {
      const { stdout: javaPath } = await execAsync("which java", { timeout: 1000 });
      inventory.languages.java = [{
        version: javaVersion.trim(),
        path: javaPath.trim(),
      }];
    }
  } catch {
    // Java not available
  }

  // Rust
  try {
    const { stdout: rustVersion } = await execAsync("rustc --version 2>/dev/null", { timeout: 2000 });
    const { stdout: rustPath } = await execAsync("which rustc", { timeout: 1000 });
    if (rustVersion && rustPath) {
      inventory.languages.rust = {
        version: rustVersion.trim(),
        path: rustPath.trim(),
      };
    }
  } catch {
    // Rust not available
  }

  // Go
  try {
    const { stdout: goVersion } = await execAsync("go version 2>/dev/null", { timeout: 2000 });
    const { stdout: goPath } = await execAsync("which go", { timeout: 1000 });
    if (goVersion && goPath) {
      inventory.languages.go = {
        version: goVersion.trim(),
        path: goPath.trim(),
      };
    }
  } catch {
    // Go not available
  }

  // Ruby (including rbenv versions)
  try {
    const { stdout: rubyVersion } = await execAsync("ruby --version 2>/dev/null", { timeout: 2000 });
    const { stdout: rubyPath } = await execAsync("which ruby", { timeout: 1000 });
    if (rubyVersion && rubyPath) {
      inventory.languages.ruby = [{
        version: rubyVersion.trim(),
        path: rubyPath.trim(),
      }];
    }
  } catch {
    // Ruby not available
  }
}

/**
 * Discover package managers and their global packages
 */
async function discoverPackageManagers(
  platform: string,
  inventory: ComprehensiveSoftwareInventory
): Promise<void> {
  // NPM
  try {
    const { stdout: npmVersion } = await execAsync("npm --version 2>/dev/null", { timeout: 2000 });
    if (npmVersion) {
      const { stdout: globalPackages } = await execAsync("npm list -g --depth=0 --parseable 2>/dev/null | tail -n +2 | xargs -n1 basename", { timeout: 5000 })
        .catch(() => ({ stdout: "" }));
      
      inventory.packageManagers.npm = {
        version: npmVersion.trim(),
        globalPackages: globalPackages.split("\n").filter(Boolean),
      };
    }
  } catch {
    // NPM not available
  }

  // Pip
  try {
    const { stdout: pipVersion } = await execAsync("pip --version 2>/dev/null | head -1", { timeout: 2000 });
    if (pipVersion) {
      const { stdout: globalPackages } = await execAsync("pip list --user --format=freeze 2>/dev/null | cut -d= -f1", { timeout: 5000 })
        .catch(() => ({ stdout: "" }));
      
      inventory.packageManagers.pip = {
        version: pipVersion.trim(),
        globalPackages: globalPackages.split("\n").filter(Boolean),
      };
    }
  } catch {
    // Pip not available
  }

  // Cargo
  try {
    const { stdout: cargoVersion } = await execAsync("cargo --version 2>/dev/null", { timeout: 2000 });
    if (cargoVersion) {
      inventory.packageManagers.cargo = {
        version: cargoVersion.trim(),
      };
    }
  } catch {
    // Cargo not available
  }

  // Yarn
  try {
    const { stdout: yarnVersion } = await execAsync("yarn --version 2>/dev/null", { timeout: 2000 });
    if (yarnVersion) {
      inventory.packageManagers.yarn = {
        version: yarnVersion.trim(),
      };
    }
  } catch {
    // Yarn not available
  }

  // PNPM
  try {
    const { stdout: pnpmVersion } = await execAsync("pnpm --version 2>/dev/null", { timeout: 2000 });
    if (pnpmVersion) {
      inventory.packageManagers.pnpm = {
        version: pnpmVersion.trim(),
      };
    }
  } catch {
    // PNPM not available
  }

  // Composer (PHP)
  try {
    const { stdout: composerVersion } = await execAsync("composer --version 2>/dev/null | head -1", { timeout: 2000 });
    if (composerVersion) {
      inventory.packageManagers.composer = {
        version: composerVersion.trim(),
      };
    }
  } catch {
    // Composer not available
  }
}

/**
 * Discover development tools
 */
async function discoverDevelopmentTools(
  platform: string,
  inventory: ComprehensiveSoftwareInventory
): Promise<void> {
  // Git
  try {
    const { stdout: gitVersion } = await execAsync("git --version 2>/dev/null", { timeout: 2000 });
    if (gitVersion) {
      const gitConfig: Record<string, string> = {};
      try {
        const { stdout: userName } = await execAsync("git config --global user.name 2>/dev/null", { timeout: 1000 });
        const { stdout: userEmail } = await execAsync("git config --global user.email 2>/dev/null", { timeout: 1000 });
        if (userName) gitConfig.userName = userName.trim();
        if (userEmail) gitConfig.userEmail = userEmail.trim();
      } catch {
        // Git config not available
      }

      inventory.developmentTools.git = {
        version: gitVersion.trim(),
        config: Object.keys(gitConfig).length > 0 ? gitConfig : undefined,
      };
    }
  } catch {
    // Git not available
  }

  // Docker
  try {
    const { stdout: dockerVersion } = await execAsync("docker --version 2>/dev/null", { timeout: 2000 });
    if (dockerVersion) {
      const { stdout: containerCount } = await execAsync("docker ps -q 2>/dev/null | wc -l", { timeout: 2000 })
        .catch(() => ({ stdout: "0" }));
      
      inventory.developmentTools.docker = {
        version: dockerVersion.trim(),
        containers: parseInt(containerCount.trim(), 10) || 0,
      };
    }
  } catch {
    // Docker not available
  }

  // VS Code
  try {
    const codePath = platform === "darwin" 
      ? "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
      : await execAsync("which code", { timeout: 1000 }).then(r => r.stdout.trim()).catch(() => null);
    
    if (codePath) {
      const { stdout: codeVersion } = await execAsync(`${codePath} --version 2>/dev/null | head -1`, { timeout: 2000 });
      if (codeVersion) {
        inventory.developmentTools.vscode = {
          version: codeVersion.trim(),
          extensions: [], // Could discover extensions, but might be slow
        };
      }
    }
  } catch {
    // VS Code not available
  }

  // Other editors
  const editors = ["vim", "nano", "emacs", "subl", "atom"];
  inventory.developmentTools.editors = [];
  for (const editor of editors) {
    try {
      const { stdout: version } = await execAsync(`${editor} --version 2>/dev/null | head -1`, { timeout: 1000 });
      if (version) {
        inventory.developmentTools.editors.push({
          name: editor,
          version: version.trim(),
        });
      }
    } catch {
      // Editor not available
    }
  }
}

/**
 * Discover all executables in PATH
 */
async function discoverExecutables(
  platform: string,
  inventory: ComprehensiveSoftwareInventory
): Promise<void> {
  const pathEnv = process.env.PATH || "";
  const paths = pathEnv.split(path.delimiter).filter(Boolean);

  for (const dirPath of paths) {
    try {
      const entries = await fs.readdir(dirPath);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        try {
          const stats = await fs.stat(fullPath);
          if (stats.isFile() && (stats.mode & parseInt("111", 8))) { // Executable
            const type = dirPath.includes("snap") ? "snap" :
                        dirPath.startsWith("/usr") || dirPath.startsWith("/bin") ? "system" : "user";
            inventory.executables.push({
              name: entry,
              path: fullPath,
              type,
            });
          }
        } catch {
          // Skip files we can't stat
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  // Remove duplicates
  const seen = new Set<string>();
  inventory.executables = inventory.executables.filter(exec => {
    if (seen.has(exec.name)) return false;
    seen.add(exec.name);
    return true;
  });
}

/**
 * Discover system services
 */
async function discoverServices(
  platform: string,
  inventory: ComprehensiveSoftwareInventory
): Promise<void> {
  if (platform === "linux") {
    // Systemd services
    try {
      const { stdout } = await execAsync("systemctl list-units --type=service --no-pager --no-legend 2>/dev/null | head -50", { timeout: 5000 });
      inventory.services = stdout
        .split("\n")
        .filter(Boolean)
        .map(line => {
          const parts = line.split(/\s+/);
          const name = parts[0] || "";
          const status = parts[3] === "running" ? "running" : "stopped";
          return {
            name: name.replace(".service", ""),
            status,
            type: "systemd",
          };
        });
    } catch {
      // Systemd not available
    }
  } else if (platform === "darwin") {
    // Launchd services (user agents)
    try {
      const { stdout } = await execAsync("launchctl list 2>/dev/null | tail -n +2 | head -50", { timeout: 5000 });
      inventory.services = stdout
        .split("\n")
        .filter(Boolean)
        .map(line => {
          const parts = line.split(/\s+/);
          const pid = parts[0];
          const status = pid !== "-" ? "running" : "stopped";
          const name = parts[2] || parts[1] || "";
          return {
            name,
            status,
            type: "launchd",
          };
        });
    } catch {
      // Launchd not available
    }
  }
}

/**
 * Discover browsers comprehensively
 */
async function discoverBrowsers(
  platform: string,
  inventory: ComprehensiveSoftwareInventory
): Promise<void> {
  const browserNames = [
    "opera", "firefox", "chrome", "chromium", "brave", "edge",
    "vivaldi", "tor-browser", "waterfox", "librewolf", "ungoogled-chromium", "safari"
  ];

  // Check which command
  try {
    const { stdout } = await execAsync(`which ${browserNames.join(" ")} 2>/dev/null || true`, { timeout: 5000 });
    const found = stdout.split("\n").filter(Boolean).map(line => {
      const name = line.split("/").pop()?.trim();
      return name && browserNames.some(b => name.toLowerCase().includes(b.toLowerCase())) ? name : null;
    }).filter(Boolean) as string[];
    inventory.browsers.push(...found);
  } catch {
    // Ignore errors
  }

  // Check snap (Linux)
  if (platform === "linux") {
    try {
      const { stdout } = await execAsync("snap list 2>/dev/null | grep -E '(opera|firefox|chrome|chromium|brave|edge|vivaldi)' || true", { timeout: 5000 });
      const snapPackages = stdout.split("\n")
        .filter(line => line.trim() && !line.includes("Name"))
        .map(line => line.split(/\s+/)[0])
        .filter(name => browserNames.some(b => name.toLowerCase().includes(b.toLowerCase())));
      inventory.browsers.push(...snapPackages);
    } catch {
      // Ignore errors
    }
  }

  // Check Applications directory (macOS)
  if (platform === "darwin") {
    try {
      const { stdout } = await execAsync("ls -1 /Applications 2>/dev/null | grep -iE '(opera|firefox|chrome|chromium|brave|edge|safari)' || true", { timeout: 2000 });
      const apps = stdout.split("\n")
        .filter(Boolean)
        .map(app => app.replace(".app", "").toLowerCase())
        .filter(name => browserNames.some(b => name.includes(b)));
      inventory.browsers.push(...apps);
    } catch {
      // Ignore errors
    }
  }

  // Remove duplicates
  inventory.browsers = Array.from(new Set(inventory.browsers));
}

// ============================================================================
// FILE SYSTEM INDEXING
// ============================================================================

/**
 * Index file system structure (home directory, projects)
 */
export async function indexFileSystem(homeDir: string): Promise<FileSystemIndex> {
  const index: FileSystemIndex = {
    directoryTree: await buildDirectoryTree(homeDir, 2), // Depth 2 for performance
    projects: await discoverProjects(homeDir),
    importantFiles: await discoverImportantFiles(homeDir),
  };

  return index;
}

/**
 * Build directory tree structure
 */
async function buildDirectoryTree(
  rootPath: string,
  maxDepth: number
): Promise<DirectoryNode> {
  const stats = await fs.stat(rootPath).catch(() => null);
  if (!stats) {
    return { path: rootPath, type: "directory", name: path.basename(rootPath), children: [] };
  }

  const node: DirectoryNode = {
    path: rootPath,
    type: stats.isDirectory() ? "directory" : "file",
    name: path.basename(rootPath),
    metadata: {
      size: stats.size,
      mtime: stats.mtime.toISOString(),
    },
  };

  if (stats.isDirectory() && maxDepth > 0) {
    try {
      const entries = await fs.readdir(rootPath);
      const children: DirectoryNode[] = [];

      for (const entry of entries) {
        // Skip hidden files and common ignore patterns
        if (entry.startsWith(".") && entry !== ".git") continue;
        if (["node_modules", ".git", "build", "dist", ".next"].includes(entry)) {
          // Note existence but don't recurse
          children.push({
            path: path.join(rootPath, entry),
            type: "directory",
            name: entry,
            children: [],
          });
          continue;
        }

        try {
          const childPath = path.join(rootPath, entry);
          const childNode = await buildDirectoryTree(childPath, maxDepth - 1);
          children.push(childNode);
        } catch {
          // Skip entries we can't access
        }
      }

      node.children = children;
    } catch {
      // Can't read directory
      node.children = [];
    }
  }

  return node;
}

/**
 * Discover all projects (git repos, package.json, etc.)
 */
async function discoverProjects(homeDir: string): Promise<ProjectInfo[]> {
  const projects: ProjectInfo[] = [];

  async function scanForProjects(dir: string, depth: number = 0): Promise<void> {
    if (depth > 5) return; // Limit recursion depth

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      // Check if this directory is a project
      const hasGit = entries.some(e => e.isDirectory() && e.name === ".git");
      const hasPackageJson = entries.some(e => e.isFile() && e.name === "package.json");
      const hasRequirementsTxt = entries.some(e => e.isFile() && e.name === "requirements.txt");
      const hasCargoToml = entries.some(e => e.isFile() && e.name === "Cargo.toml");
      const hasGoMod = entries.some(e => e.isFile() && e.name === "go.mod");

      if (hasGit || hasPackageJson || hasRequirementsTxt || hasCargoToml || hasGoMod) {
        const project: ProjectInfo = {
          root: dir,
          type: hasGit ? "git" :
                hasPackageJson ? "node" :
                hasRequirementsTxt ? "python" :
                hasCargoToml ? "rust" :
                hasGoMod ? "go" : "unknown",
        };

        // Get git info if available
        if (hasGit) {
          try {
            const { stdout: branch } = await execAsync(`cd ${dir} && git branch --show-current 2>/dev/null`, { timeout: 2000 });
            const { stdout: remote } = await execAsync(`cd ${dir} && git remote get-url origin 2>/dev/null`, { timeout: 2000 });
            project.gitInfo = {
              branch: branch.trim() || undefined,
              remote: remote.trim() || undefined,
            };
          } catch {
            // Git info not available
          }
        }

        // Get package info if Node.js project
        if (hasPackageJson) {
          try {
            const packageJsonPath = path.join(dir, "package.json");
            const content = await fs.readFile(packageJsonPath, "utf-8");
            const pkg = JSON.parse(content);
            project.name = pkg.name;
            project.version = pkg.version;
            project.packageInfo = {
              name: pkg.name,
              version: pkg.version,
              dependencies: { ...pkg.dependencies, ...pkg.devDependencies },
            };
          } catch {
            // Can't read package.json
          }
        }

        projects.push(project);
        return; // Don't recurse into project subdirectories
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".") && 
            !["node_modules", "build", "dist", ".git"].includes(entry.name)) {
          await scanForProjects(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Can't read directory
    }
  }

  await scanForProjects(homeDir);
  return projects;
}

/**
 * Discover important configuration files
 */
async function discoverImportantFiles(homeDir: string): Promise<ImportantFile[]> {
  const importantFiles: ImportantFile[] = [];
  const configFiles = [
    ".env", ".env.local", ".gitconfig", ".npmrc", ".bashrc", ".zshrc",
    "Dockerfile", "docker-compose.yml", ".dockerignore",
  ];

  async function scanForConfigFiles(dir: string, depth: number = 0): Promise<void> {
    if (depth > 3) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && configFiles.includes(entry.name)) {
          const filePath = path.join(dir, entry.name);
          const type = entry.name.includes("env") ? "env" :
                      entry.name.includes("git") ? "config" :
                      entry.name.includes("npm") ? "config" :
                      entry.name.includes("Dockerfile") ? "dockerfile" :
                      entry.name.includes("docker") ? "dockerfile" :
                      "config";

          try {
            const stats = await fs.stat(filePath);
            // Only read small config files (< 10KB)
            if (stats.size < 10240) {
              const content = await fs.readFile(filePath, "utf-8");
              importantFiles.push({
                path: filePath,
                type,
                content,
              });
            } else {
              importantFiles.push({
                path: filePath,
                type,
              });
            }
          } catch {
            // Can't read file
          }
        }

        if (entry.isDirectory() && !entry.name.startsWith(".") && depth < 2) {
          await scanForConfigFiles(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Can't read directory
    }
  }

  await scanForConfigFiles(homeDir);
  return importantFiles;
}

// ============================================================================
// RUNNING STATE DISCOVERY
// ============================================================================

/**
 * Discover running processes, ports, containers
 */
export async function discoverRunningState(platform: string): Promise<RunningState> {
  const state: RunningState = {
    processes: [],
    listeningPorts: [],
    containers: [],
    devServers: [],
  };

  // Discover processes
  if (platform === "linux") {
    try {
      const { stdout } = await execAsync("ps aux --no-headers 2>/dev/null | head -50", { timeout: 3000 });
      state.processes = stdout.split("\n").filter(Boolean).map(line => {
        const parts = line.split(/\s+/);
        return {
          name: parts[10] || "",
          pid: parseInt(parts[1] || "0", 10),
          command: parts.slice(10).join(" "),
        };
      }).filter(p => p.name);
    } catch {
      // Can't get processes
    }
  } else if (platform === "darwin") {
    try {
      const { stdout } = await execAsync("ps aux | head -50", { timeout: 3000 });
      state.processes = stdout.split("\n").slice(1).filter(Boolean).map(line => {
        const parts = line.split(/\s+/);
        return {
          name: parts[10] || "",
          pid: parseInt(parts[1] || "0", 10),
          command: parts.slice(10).join(" "),
        };
      }).filter(p => p.name);
    } catch {
      // Can't get processes
    }
  }

  // Discover listening ports
  try {
    const { stdout } = await execAsync(
      platform === "linux" 
        ? "ss -tlnp 2>/dev/null | grep LISTEN | head -20"
        : "lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | head -20",
      { timeout: 3000 }
    );
    state.listeningPorts = stdout.split("\n").filter(Boolean).map(line => {
      // Parse port from output (simplified)
      const portMatch = line.match(/:(\d+)/);
      return {
        port: portMatch ? parseInt(portMatch[1], 10) : 0,
        protocol: "tcp",
      };
    }).filter(p => p.port > 0);
  } catch {
    // Can't get ports
  }

  // Discover Docker containers
  try {
    const { stdout } = await execAsync("docker ps --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null", { timeout: 3000 });
    state.containers = stdout.split("\n").filter(Boolean).map(line => {
      const [id, name, image, status] = line.split("\t");
      return {
        id: id || "",
        name: name || "",
        image: image || "",
        status: status || "",
      };
    });
  } catch {
    // Docker not available
  }

  // Detect dev servers from listening ports
  const commonDevPorts = [3000, 3001, 5000, 5001, 8000, 8080, 8081, 5173, 5174];
  state.devServers = state.listeningPorts
    .filter(p => commonDevPorts.includes(p.port))
    .map(p => ({
      type: "other" as const,
      port: p.port,
    }));

  return state;
}

// ============================================================================
// ENVIRONMENT CONTEXT
// ============================================================================

/**
 * Discover environment configuration
 */
export async function discoverEnvironmentContext(homeDir: string): Promise<EnvironmentContext> {
  const context: EnvironmentContext = {
    environmentVariables: {},
    shellConfig: {
      shell: process.env.SHELL || process.env.COMSPEC || "",
    },
    applicationConfigs: {},
  };

  // Collect relevant environment variables (filter sensitive ones)
  const relevantVars = [
    "PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL",
    "NODE_ENV", "PYTHONPATH", "GOPATH", "CARGO_HOME",
    "DOCKER_HOST", "EDITOR", "VISUAL",
  ];

  for (const varName of relevantVars) {
    if (process.env[varName]) {
      context.environmentVariables[varName] = process.env[varName]!;
    }
  }

  // Read shell config
  const shell = process.env.SHELL || "";
  if (shell.includes("bash")) {
    try {
      const bashrc = await fs.readFile(path.join(homeDir, ".bashrc"), "utf-8").catch(() => "");
      context.shellConfig.configFile = ".bashrc";
      // Extract aliases (simplified)
      const aliasMatches = bashrc.match(/alias\s+(\w+)="?([^"\n]+)"?/g) || [];
      context.shellConfig.aliases = {};
      for (const match of aliasMatches) {
        const [, name, value] = match.match(/alias\s+(\w+)="?([^"\n]+)"?/) || [];
        if (name && value) {
          context.shellConfig.aliases[name] = value;
        }
      }
    } catch {
      // Can't read bashrc
    }
  } else if (shell.includes("zsh")) {
    try {
      const zshrc = await fs.readFile(path.join(homeDir, ".zshrc"), "utf-8").catch(() => "");
      context.shellConfig.configFile = ".zshrc";
      // Extract aliases (simplified)
      const aliasMatches = zshrc.match(/alias\s+(\w+)="?([^"\n]+)"?/g) || [];
      context.shellConfig.aliases = {};
      for (const match of aliasMatches) {
        const [, name, value] = match.match(/alias\s+(\w+)="?([^"\n]+)"?/) || [];
        if (name && value) {
          context.shellConfig.aliases[name] = value;
        }
      }
    } catch {
      // Can't read zshrc
    }
  }

  // Read git config
  try {
    const gitConfigPath = path.join(homeDir, ".gitconfig");
    const gitConfig = await fs.readFile(gitConfigPath, "utf-8");
    const config: Record<string, string> = {};
    
    // Parse git config (handle multiline)
    const nameMatch = gitConfig.match(/\[user\]\s*\n\s*name\s*=\s*(.+)/);
    const emailMatch = gitConfig.match(/\[user\]\s*\n[\s\S]*?\n\s*email\s*=\s*(.+)/);
    
    if (nameMatch) {
      config.userName = nameMatch[1]?.trim() || "";
    }
    if (emailMatch) {
      config.userEmail = emailMatch[1]?.trim() || "";
    }
    
    if (Object.keys(config).length > 0) {
      context.applicationConfigs.git = config;
    }
  } catch {
    // Can't read git config
  }

  // Read npm config
  try {
    const npmrcPath = path.join(homeDir, ".npmrc");
    const npmrc = await fs.readFile(npmrcPath, "utf-8");
    const config: Record<string, string> = {};
    npmrc.split("\n").forEach(line => {
      const match = line.match(/(.+?)=(.+)/);
      if (match) {
        config[match[1].trim()] = match[2].trim();
      }
    });
    if (Object.keys(config).length > 0) {
      context.applicationConfigs.npm = config;
    }
  } catch {
    // Can't read npmrc
  }

  return context;
}

