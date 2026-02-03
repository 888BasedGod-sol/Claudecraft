/**
 * Log Stream - Simple logging interface for bots
 */

import { logStreamer, LogMessage } from './logStreamer';

type LogType = 'INFO' | 'ERROR' | 'WARN' | 'DEBUG' | 'CLAUDE' | 'ACTION' | 'BUILDER' | 'BUILD' | 'MILESTONE' | 'CHAT' | 'SURVIVAL' | 'SHARE' | 'HELP' | 'COLLABORATE' | 'PROJECT' | 'SOCIAL' | 'MEETING';

class LogStream {
  log(type: LogType, message: string, botName?: string): void {
    const timestamp = new Date().toISOString();

    const typeMap: Record<string, LogMessage['type']> = {
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
      'SURVIVAL': 'claude'
    };

    const logType = typeMap[type.toUpperCase()] || 'info';

    console.log(`[${type}] ${timestamp} - ${message}`);

    logStreamer.broadcast({
      type: logType,
      timestamp,
      message,
      botName
    });
  }
}

export const logStream = new LogStream();
