// src/utils/logger.ts

/**
 * Defines the interface for our logger.
 * This allows for easy swapping of logging implementations.
 */
export interface Logger {
  info(message: string, ...meta: any[]): void;
  warn(message: string, ...meta: any[]): void;
  error(message: string, ...meta: any[]): void;
  debug(message: string, ...meta: any[]): void;
}

/**
 * A simple console-based logger implementation.
 * You can extend or replace this with more sophisticated logging libraries (e.g., Winston, Pino).
 */
class ConsoleLogger implements Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  info(message: string, ...meta: any[]): void {
    console.log(`[${this.getTimestamp()}] [INFO] ${message}`, ...meta);
  }

  warn(message: string, ...meta: any[]): void {
    console.warn(`[${this.getTimestamp()}] [WARN] ${message}`, ...meta);
  }

  error(message: string, ...meta: any[]): void {
    console.error(`[${this.getTimestamp()}] [ERROR] ${message}`, ...meta);
  }

  debug(message: string, ...meta: any[]): void {
    // Only log debug messages if a debug environment variable is set
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_MODE === 'true') {
      console.debug(`[${this.getTimestamp()}] [DEBUG] ${message}`, ...meta);
    }
  }
}

/**
 * The default logger instance to be used throughout the application.
 * You can set this to a different logger implementation if needed.
 */
export const logger: Logger = new ConsoleLogger();

/**
 * Optional: Function to set a custom logger.
 * This is useful for testing or integrating with external logging systems.
 * @param customLogger The logger instance to use.
 */
export function setLogger(customLogger: Logger): void {
  (module.exports as any).logger = customLogger; // Directly update the exported logger
}
