import { Logger } from "../../../src/types.js";

// src/utils/ConsoleLogger.ts
export class ConsoleLogger implements Logger {
  info(message: string, ...meta: any[]): void {
    console.log(message, ...meta);
  }
  error(message: string, ...meta: any[]): void {
    console.error(message, ...meta);
  }
  warn(message: string, ...meta: any[]): void {
    console.warn(message, ...meta);
  }
  debug(message: string, ...meta: any[]): void {
    console.debug(message, ...meta);
  }
}
