/**
 * Structured logging system with TypeScript support
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { LogEntry } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'text' | 'json';
  file?: string;
}

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class Logger {
  private config: LoggerConfig;
  private fileStream?: fs.WriteStream;

  constructor(config: LoggerConfig) {
    this.config = config;

    if (config.file) {
      const logDir = path.dirname(config.file);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      this.fileStream = fs.createWriteStream(config.file, { flags: 'a' });
    }
  }

  private shouldLog(level: keyof typeof LOG_LEVELS): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  private formatLogEntry(
    level: string,
    module: string,
    message: string,
    metadata?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: Date.now(),
      level: level as 'debug' | 'info' | 'warn' | 'error',
      module,
      message,
      ...(metadata && { metadata })
    };
  }

  private writeLog(entry: LogEntry): void {
    let output: string;

    if (this.config.format === 'json') {
      output = JSON.stringify(entry);
    } else {
      const levelPad = entry.level.toUpperCase().padEnd(5);
      const timePad = new Date(entry.timestamp).toISOString();
      const meta = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
      output = `[${timePad}] [${levelPad}] [${entry.module}] ${entry.message}${meta}`;
    }

    console.log(output);

    if (this.fileStream) {
      this.fileStream.write(output + '\n');
    }
  }

  debug(module: string, message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      this.writeLog(this.formatLogEntry('debug', module, message, metadata));
    }
  }

  info(module: string, message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.writeLog(this.formatLogEntry('info', module, message, metadata));
    }
  }

  warn(module: string, message: string, metadata?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.writeLog(this.formatLogEntry('warn', module, message, metadata));
    }
  }

  error(module: string, message: string, error?: Error | null, metadata?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'error',
        module,
        message,
        ...(error && { error: error.message }),
        ...(metadata && { metadata })
      };
      this.writeLog(entry);
    }
  }

  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
    }
  }
}

// Global logger instance
let loggerInstance: Logger | null = null;

export function initializeLogger(config: LoggerConfig): Logger {
  loggerInstance = new Logger(config);
  return loggerInstance;
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger({
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      format: (process.env.LOG_FORMAT as 'text' | 'json') || 'text'
    });
  }
  return loggerInstance;
}

export default getLogger();
