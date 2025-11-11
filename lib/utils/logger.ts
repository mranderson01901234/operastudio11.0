/**
 * Performance-optimized logging utility
 * 
 * Features:
 * - Can be disabled in production
 * - Throttles frequent logs to prevent console spam
 * - Only logs in development by default
 * - Supports log levels
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  throttleMs: number;
}

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development';

// Check if verbose logging is disabled (for performance)
// Set DISABLE_VERBOSE_LOGS=true to reduce console output during startup
const disableVerboseLogs = process.env.DISABLE_VERBOSE_LOGS === 'true';

// Default config - only enable in development, but respect DISABLE_VERBOSE_LOGS
const defaultConfig: LogConfig = {
  enabled: isDevelopment && !disableVerboseLogs,
  level: disableVerboseLogs ? 'error' : (isDevelopment ? 'debug' : 'error'), // Only errors if disabled
  throttleMs: disableVerboseLogs ? 5000 : 1000, // More aggressive throttling if verbose logs disabled
};

// Per-tag throttling
const throttleMap = new Map<string, number>();

// Check if log should be throttled
function shouldThrottle(tag: string, throttleMs: number): boolean {
  const now = Date.now();
  const lastLog = throttleMap.get(tag);
  
  if (!lastLog || now - lastLog >= throttleMs) {
    throttleMap.set(tag, now);
    return false;
  }
  
  return true;
}

// Check if log level should be shown
function shouldLog(level: LogLevel, config: LogConfig): boolean {
  if (!config.enabled) return false;
  
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const configLevelIndex = levels.indexOf(config.level);
  const logLevelIndex = levels.indexOf(level);
  
  return logLevelIndex >= configLevelIndex;
}

// Create logger function
function createLogger(tag: string, config: LogConfig = defaultConfig) {
  return {
    debug: (...args: unknown[]) => {
      if (!shouldLog('debug', config)) return;
      if (shouldThrottle(`${tag}:debug`, config.throttleMs)) return;
      console.debug(`[${tag}]`, ...args);
    },
    
    info: (...args: unknown[]) => {
      if (!shouldLog('info', config)) return;
      if (shouldThrottle(`${tag}:info`, config.throttleMs)) return;
      console.info(`[${tag}]`, ...args);
    },
    
    log: (...args: unknown[]) => {
      if (!shouldLog('info', config)) return;
      if (shouldThrottle(`${tag}:log`, config.throttleMs)) return;
      console.log(`[${tag}]`, ...args);
    },
    
    warn: (...args: unknown[]) => {
      if (!shouldLog('warn', config)) return;
      if (shouldThrottle(`${tag}:warn`, config.throttleMs * 2)) return; // Less throttling for warnings
      console.warn(`[${tag}]`, ...args);
    },
    
    error: (...args: unknown[]) => {
      if (!shouldLog('error', config)) return;
      // Never throttle errors
      console.error(`[${tag}]`, ...args);
    },
    
    // For logging large objects - only logs summary in production
    logObject: (message: string, obj: unknown, level: LogLevel = 'debug') => {
      if (!shouldLog(level, config)) return;
      if (shouldThrottle(`${tag}:object`, config.throttleMs)) return;
      
      if (config.enabled && isDevelopment) {
        // Full object in development
        console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
          `[${tag}] ${message}`,
          obj
        );
      } else {
        // Summary only in production
        const summary = typeof obj === 'object' && obj !== null
          ? `{keys: ${Object.keys(obj).join(', ')}, type: ${typeof obj}}`
          : String(obj);
        console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
          `[${tag}] ${message}`,
          summary
        );
      }
    },
  };
}

// Export factory function
export function createAppLogger(tag: string, config?: Partial<LogConfig>) {
  return createLogger(tag, { ...defaultConfig, ...config });
}

// Export default logger for quick use
export const logger = createAppLogger('App');

// Export for environment-based configuration
export function setLogLevel(level: LogLevel) {
  defaultConfig.level = level;
}

export function setLoggingEnabled(enabled: boolean) {
  defaultConfig.enabled = enabled;
}

