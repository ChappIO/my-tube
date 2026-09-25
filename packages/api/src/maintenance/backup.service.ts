import { readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { BACKUP_KEEP, type MaintenanceStatus } from '@mytube/shared';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database, sqliteClient } from '../database/database.module.js';

/** `mytube-2026-09-26T04:00:00Z.sqlite`: the backup files, named by when they were taken. */
const BACKUP_FILE = /^mytube-(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\.sqlite$/;

/** Pages copied per step of the online backup; small steps let writers in between. */
const PAGES_PER_STEP = 1000;

export type BackupInfo = NonNullable<MaintenanceStatus['backup']['last']>;

export interface BackupResult extends BackupInfo {
  /** Absolute path of the new file. */
  path: string;
  /** Older backups removed to keep `BACKUP_KEEP`. */
  removed: string[];
}

export interface BackupContext {
  /** Fraction of the database pages copied (0 to 1). */
  progress?: (fraction: number) => void;
  log?: (line: string) => void;
}

/** The backup file name for a moment: `mytube-2026-09-26T04:00:00Z.sqlite` (UTC, whole seconds). */
export function backupFileName(at: Date): string {
  return `mytube-${at.toISOString().replace(/\.\d{3}Z$/, 'Z')}.sqlite`;
}

/**
 * Database backups in `CONFIG_DIR/backups`. The settings live in the database, so the one file
 * is the whole state; the yt-dlp binary, the artwork cache and the logs are rebuilt or
 * disposable. Restoring is manual: stop the container and copy a backup over `mytube.db` (and
 * remove `mytube.db-wal` and `mytube.db-shm`).
 */
@Injectable()
export class BackupService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  dir(): string {
    return join(this.config.configDir, 'backups');
  }

  /**
   * Copies the live database with SQLite's online backup (consistent while the app keeps
   * writing) to a temp file, renames it into place, then removes all but the newest
   * `BACKUP_KEEP` backups.
   */
  async backup(ctx: BackupContext = {}, now = new Date()): Promise<BackupResult> {
    const dir = this.dir();
    await mkdir(dir, { recursive: true });
    const file = backupFileName(now);
    const path = join(dir, file);
    const temp = join(dir, `.${file}.partial`);
    rmSync(temp, { force: true });
    try {
      await sqliteClient(this.db).backup(temp, {
        progress: ({ totalPages, remainingPages }) => {
          if (totalPages > 0) ctx.progress?.((totalPages - remainingPages) / totalPages);
          return PAGES_PER_STEP;
        },
      });
      ctx.progress?.(1);
      renameSync(temp, path);
    } finally {
      rmSync(temp, { force: true });
    }
    const sizeBytes = statSync(path).size;
    ctx.log?.(`wrote ${path} (${sizeBytes} bytes)`);
    const removed = this.rotate();
    for (const name of removed) ctx.log?.(`removed old backup ${name}`);
    return { file, at: atOf(file)!, sizeBytes, path, removed };
  }

  /** The newest backup, or null before the first one. */
  latest(): BackupInfo | null {
    const file = this.files()[0];
    if (!file) return null;
    try {
      return { file, at: atOf(file)!, sizeBytes: statSync(join(this.dir(), file)).size };
    } catch {
      return null;
    }
  }

  /** Backup file names, newest first (the names sort by time). */
  files(): string[] {
    try {
      return readdirSync(this.dir())
        .filter((name) => BACKUP_FILE.test(name))
        .toSorted()
        .toReversed();
    } catch {
      return [];
    }
  }

  /** Removes all but the newest `keep` backups; returns the removed names. */
  rotate(keep = BACKUP_KEEP): string[] {
    const old = this.files().slice(keep);
    for (const name of old) rmSync(join(this.dir(), name), { force: true });
    return old;
  }
}

/** The ISO time in a backup file name. */
function atOf(file: string): string | undefined {
  return BACKUP_FILE.exec(file)?.[1];
}
