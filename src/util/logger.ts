// src/utils/logger.ts

import { Logger } from "../types.js";

/**
 * A logger that does nothing. This is the default logger for the client,
 * ensuring the library is silent unless a consumer provides their own logger.
 */
class NoOpLogger implements Logger {
  info() { /* do nothing */ }
  warn() { /* do nothing */ }
  error() { /* do nothing */ }
  debug() { /* do nothing */ }
}

/**
 * An instance of the NoOpLogger to be used as the default.
 * This is not exported, it's an internal detail.
 */
export const silentLogger: Logger = new NoOpLogger();
