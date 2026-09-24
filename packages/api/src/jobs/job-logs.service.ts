import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import type { JobRow } from './job-runner.js';

/** How many job logs are kept; older ones are removed after each job. */
export const JOB_LOGS_KEPT = 200;
/** Longer lines (yt-dlp's metadata JSON is one line) are cut, with a note of what was left out. */
export const JOB_LOG_MAX_LINE = 64 * 1024;

/**
 * One open job log. `line` appends synchronously, so lines land in order and survive a crash;
 * a job writes a few lines per second at most.
 */
export interface JobLog {
  readonly path: string;
  /** Appends one line. A property, so it can be passed on as a callback. */
  readonly line: (text: string) => void;
  readonly close: () => void;
}

/**
 * The per-job logs in `CONFIG_DIR/logs/jobs/<job id>.log`: the full output of every yt-dlp run a
 * job makes, line by line as it happens, so a failed download can be troubleshot. Each attempt
 * appends a header; retries of one job share its file. The newest `JOB_LOGS_KEPT` files are kept.
 */
@Injectable()
export class JobLogsService {
  private readonly logger = new Logger('JobLogs');
  readonly dir: string;

  constructor(config: AppConfig) {
    this.dir = join(config.configDir, 'logs', 'jobs');
  }

  path(jobId: number): string {
    return join(this.dir, `${jobId}.log`);
  }

  exists(jobId: number): boolean {
    return existsSync(this.path(jobId));
  }

  /** Opens the job's log for appending and writes the attempt header. Never throws. */
  open(job: JobRow): JobLog {
    const path = this.path(job.id);
    let fd: number | null = null;
    try {
      mkdirSync(this.dir, { recursive: true });
      fd = openSync(path, 'a');
    } catch (error) {
      this.logger.warn(`Cannot write job log ${path}: ${String(error)}`);
    }
    const write = (text: string) => {
      if (fd === null) return;
      try {
        writeSync(fd, `${text}\n`);
      } catch {
        // A full disk must not fail the job; the log is best effort.
      }
    };
    write(
      `=== ${job.type} job ${job.id} · attempt ${job.attempts + 1} of ${job.maxAttempts} · ` +
        `${new Date().toISOString()} · ${job.payload.title}`,
    );
    return {
      path,
      line: (text) => write(clip(text)),
      close: () => {
        if (fd === null) return;
        try {
          closeSync(fd);
        } catch {
          // Already closed.
        }
        fd = null;
      },
    };
  }

  /** Removes all but the newest `keep` logs (by modification time). Never throws. */
  prune(keep = JOB_LOGS_KEPT): number {
    let files: { path: string; mtime: number }[];
    try {
      files = readdirSync(this.dir)
        .filter((name) => /^\d+\.log$/.test(name))
        .map((name) => {
          const path = join(this.dir, name);
          return { path, mtime: statSync(path).mtimeMs };
        });
    } catch {
      return 0;
    }
    if (files.length <= keep) return 0;
    files.sort((a, b) => b.mtime - a.mtime);
    let removed = 0;
    for (const file of files.slice(keep)) {
      try {
        rmSync(file.path, { force: true });
        removed++;
      } catch {
        // Try again after the next job.
      }
    }
    return removed;
  }
}

function clip(text: string): string {
  if (text.length <= JOB_LOG_MAX_LINE) return text;
  return `${text.slice(0, JOB_LOG_MAX_LINE)} … (${text.length - JOB_LOG_MAX_LINE} more characters)`;
}
