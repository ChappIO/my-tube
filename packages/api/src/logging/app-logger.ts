import { inspect } from 'node:util';
import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import type { DataSettings } from '@mytube/shared';
import { RotatingFile, type RotatingFileOptions } from './rotating-file.js';

type LogLevelSetting = DataSettings['logLevel'];

/** Nest levels enabled by each Settings → Advanced → Data → Log level choice. */
const LEVELS: Record<LogLevelSetting, LogLevel[]> = {
  error: ['fatal', 'error'],
  warn: ['fatal', 'error', 'warn'],
  info: ['fatal', 'error', 'warn', 'log'],
  debug: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'],
};

export function nestLogLevels(level: LogLevelSetting): LogLevel[] {
  return [...LEVELS[level]];
}

const FILE_LEVEL: Record<LogLevel, string> = {
  fatal: 'FATAL',
  error: 'ERROR',
  warn: 'WARN',
  log: 'INFO',
  debug: 'DEBUG',
  verbose: 'VERBOSE',
};

/**
 * The application logger: Nest's console output (stdout, `docker logs`) plus the same lines as
 * plain text in `CONFIG_DIR/logs/mytube.log`, rotated at 5 MB with 3 older files kept. The level
 * follows `data.logLevel` (`LogLevelSync` applies it at boot and on every settings change).
 *
 * File line format: `2026-09-25T10:00:00.000Z INFO  [Context] message`, stacks on the lines
 * after.
 */
export class AppLogger extends ConsoleLogger {
  private readonly file: RotatingFile;

  constructor(filePath: string, options: RotatingFileOptions = {}) {
    super({ logLevels: nestLogLevels('info') });
    this.file = new RotatingFile(filePath, options, (error) => {
      process.stderr.write(`MyTube cannot write its log file ${filePath}: ${String(error)}\n`);
    });
  }

  get filePath(): string {
    return this.file.path;
  }

  /** Applies a Settings log level to stdout and the file. */
  setLevel(level: LogLevelSetting): void {
    this.setLogLevels(nestLogLevels(level));
  }

  close(): void {
    this.file.close();
  }

  protected override printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
    // oxlint-disable-next-line typescript/no-explicit-any -- matches ConsoleLogger's signature
    params?: Record<string, any>,
  ): void {
    super.printMessages(messages, context, logLevel, writeStreamType, errorStack, params);
    const at = new Date().toISOString();
    const level = FILE_LEVEL[logLevel].padEnd(5);
    const scope = context ? `[${context}] ` : '';
    let text = '';
    for (const message of messages) text += `${at} ${level} ${scope}${plain(message)}\n`;
    if (typeof errorStack === 'string' && errorStack.length > 0) text += `${errorStack}\n`;
    this.file.write(text);
  }
}

function plain(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.stack ?? message.message;
  return inspect(message, { depth: 5, breakLength: Infinity, colors: false });
}
