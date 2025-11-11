import { spawn } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

/**
 * Discover installed browsers and common applications
 * This runs proactively when MCP session starts to give LLM full inventory
 */
export interface InstalledSoftware {
  browsers: string[];
  packageManagers: {
    snap?: string[];
    apt?: string[];
    brew?: string[];
  };
  commonTools: string[];
}

/**
 * Discover installed browsers comprehensively
 * Checks multiple sources: which, snap list, dpkg, common directories
 */
export async function discoverInstalledSoftware(platform: string): Promise<InstalledSoftware> {
  const result: InstalledSoftware = {
    browsers: [],
    packageManagers: {},
    commonTools: [],
  };

  if (platform === "linux") {
    await discoverLinuxSoftware(result);
  } else if (platform === "darwin") {
    await discoverMacOSSoftware(result);
  } else if (platform === "win32") {
    await discoverWindowsSoftware(result);
  }

  // Remove duplicates
  result.browsers = [...new Set(result.browsers)];
  result.commonTools = [...new Set(result.commonTools)];

  return result;
}

/**
 * Discover software on Linux systems
 */
async function discoverLinuxSoftware(result: InstalledSoftware): Promise<void> {
  const browserNames = [
    "opera", "firefox", "chrome", "chromium", "brave", "edge", 
    "vivaldi", "tor-browser", "waterfox", "librewolf", "ungoogled-chromium"
  ];

  // 1. Check which command for browsers in PATH
  try {
    const { stdout } = await execAsync(`which ${browserNames.join(" ")} 2>/dev/null || true`, { timeout: 5000 });
    const found = stdout.split("\n").filter(Boolean).map(line => {
      const name = line.split("/").pop()?.trim();
      return name && browserNames.includes(name) ? name : null;
    }).filter(Boolean) as string[];
    result.browsers.push(...found);
  } catch {
    // Ignore errors
  }

  // 2. Check snap list for browsers
  try {
    const { stdout } = await execAsync("snap list 2>/dev/null | grep -E '(opera|firefox|chrome|chromium|brave|edge|vivaldi)' || true", { timeout: 5000 });
    const snapPackages = stdout.split("\n")
      .filter(line => line.trim() && !line.includes("Name"))
      .map(line => line.split(/\s+/)[0])
      .filter(name => browserNames.some(b => name.toLowerCase().includes(b.toLowerCase())));
    result.browsers.push(...snapPackages);
    result.packageManagers.snap = snapPackages;
  } catch {
    // Ignore errors
  }

  // 3. Check dpkg for apt-installed browsers
  try {
    const { stdout } = await execAsync("dpkg -l 2>/dev/null | grep -E '(firefox|chromium|opera|brave)' || true", { timeout: 5000 });
    const aptPackages = stdout.split("\n")
      .filter(line => line.trim() && line.startsWith("ii"))
      .map(line => {
        const parts = line.split(/\s+/);
        return parts.length > 1 ? parts[1] : null;
      })
      .filter(Boolean)
      .filter(name => browserNames.some(b => name?.toLowerCase().includes(b.toLowerCase()))) as string[];
    result.browsers.push(...aptPackages);
    result.packageManagers.apt = aptPackages;
  } catch {
    // Ignore errors
  }

  // 4. Check common browser directories
  const browserDirs = [
    "/snap/bin",
    "/usr/bin",
    "/usr/local/bin",
    `${process.env.HOME}/.local/bin`,
  ];

  for (const dir of browserDirs) {
    try {
      const { stdout } = await execAsync(`ls -1 ${dir} 2>/dev/null | grep -E '(opera|firefox|chrome|chromium|brave|edge)' || true`, { timeout: 2000 });
      const found = stdout.split("\n")
        .filter(Boolean)
        .filter(name => browserNames.some(b => name.toLowerCase().includes(b.toLowerCase())));
      result.browsers.push(...found);
    } catch {
      // Ignore errors
    }
  }

  // 5. Check for common development tools
  const commonTools = ["git", "node", "npm", "python", "python3", "docker", "code", "vim", "nano"];
  for (const tool of commonTools) {
    try {
      await execAsync(`which ${tool}`, { timeout: 1000 });
      result.commonTools.push(tool);
    } catch {
      // Tool not found
    }
  }
}

/**
 * Discover software on macOS systems
 */
async function discoverMacOSSoftware(result: InstalledSoftware): Promise<void> {
  const browserNames = ["opera", "firefox", "chrome", "chromium", "brave", "edge", "safari"];

  // Check which command
  try {
    const { stdout } = await execAsync(`which ${browserNames.join(" ")} 2>/dev/null || true`, { timeout: 5000 });
    const found = stdout.split("\n").filter(Boolean).map(line => {
      const name = line.split("/").pop()?.trim();
      return name && browserNames.includes(name) ? name : null;
    }).filter(Boolean) as string[];
    result.browsers.push(...found);
  } catch {
    // Ignore errors
  }

  // Check Homebrew
  try {
    const { stdout } = await execAsync("brew list --cask 2>/dev/null | grep -E '(opera|firefox|chrome|chromium|brave|edge)' || true", { timeout: 5000 });
    const brewPackages = stdout.split("\n").filter(Boolean);
    result.browsers.push(...brewPackages);
    result.packageManagers.brew = brewPackages;
  } catch {
    // Ignore errors
  }

  // Check Applications directory
  try {
    const { stdout } = await execAsync("ls -1 /Applications 2>/dev/null | grep -iE '(opera|firefox|chrome|chromium|brave|edge|safari)' || true", { timeout: 2000 });
    const apps = stdout.split("\n")
      .filter(Boolean)
      .map(app => app.replace(".app", "").toLowerCase())
      .filter(name => browserNames.some(b => name.includes(b)));
    result.browsers.push(...apps);
  } catch {
    // Ignore errors
  }

  // Common tools
  const commonTools = ["git", "node", "npm", "python3", "docker", "code"];
  for (const tool of commonTools) {
    try {
      await execAsync(`which ${tool}`, { timeout: 1000 });
      result.commonTools.push(tool);
    } catch {
      // Tool not found
    }
  }
}

/**
 * Discover software on Windows systems
 */
async function discoverWindowsSoftware(result: InstalledSoftware): Promise<void> {
  // Windows discovery would use PowerShell commands
  // For now, return empty - can be enhanced later
  const browserNames = ["opera", "firefox", "chrome", "edge", "brave"];
  
  // Check Program Files
  try {
    const { stdout } = await execAsync('powershell -Command "Get-ChildItem \'C:\\Program Files\' -Directory | Where-Object { $_.Name -match \'(Opera|Firefox|Chrome|Edge|Brave)\' } | Select-Object -ExpandProperty Name" 2>$null', { timeout: 5000 });
    const found = stdout.split("\n")
      .filter(Boolean)
      .map(name => name.trim().toLowerCase())
      .filter(name => browserNames.some(b => name.includes(b)));
    result.browsers.push(...found);
  } catch {
    // Ignore errors
  }

  // Common tools
  const commonTools = ["git", "node", "npm", "python", "code"];
  for (const tool of commonTools) {
    try {
      await execAsync(`where ${tool}`, { timeout: 1000 });
      result.commonTools.push(tool);
    } catch {
      // Tool not found
    }
  }
}

