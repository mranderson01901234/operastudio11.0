/**
 * Parse download progress from wget/curl output
 */

export interface ParsedProgress {
  progress: number; // 0-100
  downloadedBytes: number;
  totalBytes: number | null;
  speed: number; // bytes per second
  estimatedTimeRemaining: number | null; // seconds
}

/**
 * Parse wget progress output
 * Format examples:
 * - "100%[==========================================>] 1,234,567 / 1,234,567  5.23M/s  in 0.2s"
 * - " 45%[===========>                              ] 567,890 / 1,234,567  2.1M/s  eta 15s"
 */
export function parseWgetProgress(line: string): ParsedProgress | null {
  // Match percentage, downloaded/total, speed, and ETA
  // Example: " 45%[===========>] 567,890 / 1,234,567  2.1M/s  eta 15s"
  const wgetPattern = /(\d+)%\s*\[.*?\]\s*([\d,]+)\s*\/\s*([\d,]+)\s*([\d.]+)([KMGT]?)\/s(?:\s+eta\s+(\d+)s)?/i;
  const match = line.match(wgetPattern);
  
  if (!match) return null;
  
  const progress = parseInt(match[1], 10);
  const downloadedBytes = parseBytes(match[2]);
  const totalBytes = parseBytes(match[3]);
  const speedValue = parseFloat(match[4]);
  const speedUnit = match[5].toUpperCase() || "";
  const etaSeconds = match[6] ? parseInt(match[6], 10) : null;
  
  const speed = convertToBytes(speedValue, speedUnit);
  
  return {
    progress,
    downloadedBytes,
    totalBytes,
    speed,
    estimatedTimeRemaining: etaSeconds,
  };
}

/**
 * Parse curl progress output
 * Format examples:
 * - "  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current"
 * - "                                 Dload  Upload   Total   Spent    Left  Speed"
 * - "  0  100M    0  1234k    0     0   2345k      0  0:00:43  0:00:00  0:00:43  2345k"
 * - " 45  100M   45  45.2M    0     0  2.1M      0  0:00:26  0:00:00  0:00:15  2.1M"
 */
export function parseCurlProgress(line: string): ParsedProgress | null {
  // Skip header lines
  if (line.includes("% Total") || line.includes("Dload") || line.trim().length === 0) {
    return null;
  }
  
  // Match curl progress line
  // Format: " 45  100M   45  45.2M    0     0  2.1M      0  0:00:26  0:00:00  0:00:15  2.1M"
  const parts = line.trim().split(/\s+/);
  if (parts.length < 12) return null;
  
  try {
    const percentReceived = parseFloat(parts[2]);
    const totalSize = parseBytes(parts[1]); // Total size
    const receivedSize = parseBytes(parts[3]); // Received size
    const speed = parseBytes(parts[6]); // Speed
    const timeLeft = parseTime(parts[10]); // Time left (e.g., "0:00:15")
    
    const progress = Math.round(percentReceived);
    const downloadedBytes = receivedSize;
    const totalBytes = totalSize > 0 ? totalSize : null;
    const estimatedTimeRemaining = timeLeft;
    
    return {
      progress,
      downloadedBytes,
      totalBytes,
      speed,
      estimatedTimeRemaining,
    };
  } catch {
    return null;
  }
}

/**
 * Parse bytes from string (handles commas and K/M/G/T suffixes)
 */
function parseBytes(str: string): number {
  if (!str) return 0;
  
  // Remove commas
  const cleaned = str.replace(/,/g, "");
  
  // Match number with optional suffix
  const match = cleaned.match(/^([\d.]+)([KMGT]?)$/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  return convertToBytes(value, unit);
}

/**
 * Convert value with unit to bytes
 */
function convertToBytes(value: number, unit: string): number {
  const multipliers: Record<string, number> = {
    "": 1,
    "K": 1024,
    "M": 1024 * 1024,
    "G": 1024 * 1024 * 1024,
    "T": 1024 * 1024 * 1024 * 1024,
  };
  
  return value * (multipliers[unit] || 1);
}

/**
 * Parse time string (e.g., "0:00:15" or "0:43") to seconds
 */
function parseTime(timeStr: string): number | null {
  if (!timeStr || timeStr === "0:00:00") return null;
  
  const parts = timeStr.split(":").map(Number);
  
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    // SS
    return parts[0];
  }
  
  return null;
}

/**
 * Detect if a command is a download command (wget or curl)
 */
export function isDownloadCommand(command: string, args: string[]): boolean {
  const cmd = command.toLowerCase();
  const allArgs = args.join(" ").toLowerCase();
  
  return (
    cmd === "wget" ||
    cmd === "curl" ||
    allArgs.includes("wget") ||
    allArgs.includes("curl")
  );
}

/**
 * Extract download URL and filename from wget/curl command
 */
export function extractDownloadInfo(command: string, args: string[]): {
  url: string | null;
  fileName: string | null;
} {
  let url: string | null = null;
  let fileName: string | null = null;
  
  // Find URL (usually the last argument or after -O)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Check for -O or --output-document flag (wget) or -o flag (curl)
    if ((arg === "-O" || arg === "--output-document" || arg === "-o" || arg === "--output") && i + 1 < args.length) {
      fileName = args[i + 1];
      i++; // Skip next arg
    }
    // Check if arg is a URL
    else if (arg.startsWith("http://") || arg.startsWith("https://")) {
      url = arg;
      // Extract filename from URL if not set
      if (!fileName) {
        const urlParts = arg.split("/");
        fileName = urlParts[urlParts.length - 1] || "download";
      }
    }
  }
  
  // If no URL found, try last argument
  if (!url && args.length > 0) {
    const lastArg = args[args.length - 1];
    if (lastArg.startsWith("http://") || lastArg.startsWith("https://")) {
      url = lastArg;
      if (!fileName) {
        const urlParts = lastArg.split("/");
        fileName = urlParts[urlParts.length - 1] || "download";
      }
    }
  }
  
  return { url: url || "unknown", fileName: fileName || "download" };
}

