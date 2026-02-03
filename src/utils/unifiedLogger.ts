/**
 * Unified Logger - Single logging interface for the entire application
 * 
 * Consolidates Logger and logStream into one consistent API
 */

import { logStreamer, LogMessage } from '../server/logStreamer';

export type LogLevel = 'info' | 'error' | 'warn' | 'debug' | 'claude' | 'action' | 'build';

interface LogOptions {
  botName?: string;
  broadcast?: boolean;
}

class UnifiedLogger {
  private formatMessage(level: string, message: string, botName?: string): string {
    const timestamp = new Date().toISOString();
    const prefix = botName ? `[${botName}] ` : '';
    return `[${level.toUpperCase()}] ${timestamp} - ${prefix}${message}`;
  }

  private log(level: LogLevel, message: string, options: LogOptions = {}): void {
    const { botName, broadcast = true } = options;
    const formattedMessage = this.formatMessage(level, message, botName);

    // Console output with colors
    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'claude':
        console.log(`\x1b[36m${formattedMessage}\x1b[0m`);
        break;
      case 'action':
        console.log(`\x1b[32m${formattedMessage}\x1b[0m`);
        break;
      case 'build':
        console.log(`\x1b[33m${formattedMessage}\x1b[0m`);
        break;
      default:
        console.log(formattedMessage);
    }

    // Broadcast to WebSocket clients
    if (broadcast) {
      logStreamer.broadcast({
        type: level,
        timestamp: new Date().toISOString(),
        message,
        botName,
      });
    }
  }

  info(message: string, botName?: string): void {
    this.log('info', message, { botName });
  }

  error(message: string, error?: any, botName?: string): void {
    const errorMsg = error ? `${message}: ${error}` : message;
    this.log('error', errorMsg, { botName });
  }

  warn(message: string, botName?: string): void {
    this.log('warn', message, { botName });
  }

  debug(message: string, botName?: string): void {
    this.log('debug', message, { botName });
  }

  claude(message: string, botName?: string): void {
    this.log('claude', message, { botName });
  }

  action(message: string, botName?: string): void {
    this.log('action', message, { botName });
  }

  build(message: string, botName?: string): void {
    this.log('build', message, { botName });
  }

  /**
   * Legacy-compatible method that maps old type strings
   */
  legacy(type: string, message: string, botName?: string): void {
    const typeMap: Record<string, LogLevel> = {
      'INFO': 'info',
      'ERROR': 'error',
      'WARN': 'warn',
      'DEBUG': 'debug',
      'CLAUDE': 'claude',
      'ACTION': 'action',
      'BUILDER': 'build',
      'BUILD': 'build',
      'MILESTONE': 'info',
      'CHAT': 'info',
      'SURVIVAL': 'claude',
    };

    const level = typeMap[type.toUpperCase()] || 'info';
    this.log(level, message, { botName });
  }
}

// Export singleton instance
export const logger = new UnifiedLogger();

// Legacy exports for backward compatibility
export const Logger = {
  info: (message: string) => logger.info(message),
  error: (message: string, error?: any) => logger.error(message, error),
  warn: (message: string) => logger.warn(message),
  debug: (message: string) => logger.debug(message),
  claude: (message: string) => logger.claude(message),
  build: (message: string) => logger.build(message),
  action: (message: string) => logger.action(message),
  setBotContext: (_botName: string) => {}, // No-op for compatibility
  clearBotContext: () => {}, // No-op for compatibility
};
