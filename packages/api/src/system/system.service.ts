import { createReadStream, existsSync, statSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { SystemInfo } from '@mytube/shared';
import { AppConfig } from '../config/app-config.js';

/** What `GET /api/system/logs` sends: the log file, or a short note when there is none. */
export type LogsDownload =
  | { kind: 'file'; stream: Readable; size: number }
  | { kind: 'note'; text: string };

/**
 * Facts about the running instance for Settings (mount paths, version) and the log download.
 * Backups and rescans are Stage 7 (maintenance) and not implemented here yet.
 */
@Injectable()
export class SystemService {
  constructor(private readonly config: AppConfig) {}

  info(): SystemInfo {
    return {
      version: this.config.version,
      configDir: this.config.configDir,
      musicDir: this.config.musicDir,
      videoDir: this.config.videoDir,
      platform: `${process.platform} ${process.arch}`,
    };
  }

  /**
   * Where a log file would live: `CONFIG_DIR/logs/mytube.log`. Nothing writes it yet; the API
   * logs to stdout (read it with `docker logs`). Stage 7 decides whether a file is kept.
   */
  logFilePath(): string {
    return join(this.config.configDir, 'logs', 'mytube.log');
  }

  logs(): LogsDownload {
    const path = this.logFilePath();
    const stat = existsSync(path) ? statSync(path) : undefined;
    if (stat?.isFile()) {
      return { kind: 'file', stream: createReadStream(path), size: stat.size };
    }
    return {
      kind: 'note',
      text: [
        `MyTube ${this.config.version} has no log file.`,
        '',
        'The server writes its logs to stdout. Read them with `docker logs <container>`',
        '(or in the terminal running `pnpm dev`).',
        '',
        `A log file at ${path} is served here once one exists.`,
        '',
      ].join('\n'),
    };
  }
}
