/**
 * Logger - Centralized logging with WebSocket broadcasting
 */

import { logStreamer, LogMessage } from '../server/logStreamer';

export class Logger {
  private static currentBotName?: string;

  static setBotContext(botName: string): void {
    this.currentBotName = botName;
  }

  static clearBotContext(): void {
    this.currentBotName = undefined;
  }

  private static broadcast(type: LogMessage['type'], message: string): void {
    const timestamp = new Date().toISOString();
    logStreamer.broadcast({
      type,
      timestamp,
      message,
      botName: this.currentBotName,
    });
  }

  static info(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[INFO] ${timestamp} - ${message}`);
    this.broadcast('info', message);
  }

  static error(message: string, error?: any): void {
    const timestamp = new Date().toISOString();
    const errorMsg = error ? `${message}: ${error}` : message;
    console.error(`[ERROR] ${timestamp} - ${errorMsg}`);
    this.broadcast('error', errorMsg);
  }

  static warn(message: string): void {
    const timestamp = new Date().toISOString();
    console.warn(`[WARN] ${timestamp} - ${message}`);
    this.broadcast('warn', message);
  }

  static debug(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG] ${timestamp} - ${message}`);
    this.broadcast('debug', message);
  }

  static claude(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`\x1b[36m[CLAUDE]\x1b[0m ${timestamp} - ${message}`);
    this.broadcast('claude', message);
  }

  static build(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`\x1b[33m[BUILD]\x1b[0m ${timestamp} - ${message}`);
    this.broadcast('build', message);
  }

  static action(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`\x1b[32m[ACTION]\x1b[0m ${timestamp} - ${message}`);
    this.broadcast('action', message);
  }
}
