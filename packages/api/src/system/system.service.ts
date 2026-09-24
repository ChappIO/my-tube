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
   * The application log file, `CONFIG_DIR/logs/mytube.log`, written by `AppLogger` next to
   * stdout (rotated at 5 MB, older files `mytube.log.1` to `.3`). Only the current file is served.
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
        `MyTube ${this.config.version} has not written ${path} yet.`,
        '',
        'The server also writes its logs to stdout. Read them with `docker logs <container>`',
        '(or in the terminal running `pnpm dev`).',
        '',
      ].join('\n'),
    };
  }
}
