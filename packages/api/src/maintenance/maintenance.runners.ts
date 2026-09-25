import { Injectable } from '@nestjs/common';
import { countOf, formatBytes, formatCount } from '@mytube/shared';
import { JobLogsService } from '../jobs/job-logs.service.js';
import type { JobContext, JobOutcome, JobRow, JobRunner } from '../jobs/job-runner.js';
import { BackupService, type BackupResult } from './backup.service.js';
import { RescanService, type RescanResult } from './rescan.service.js';

/** History title of a rescan: `rescan · 3,104 tracks, 368 videos on disk · 2 missing · 282 GB`. */
export function rescanTitle(result: RescanResult): string {
  const { music, video } = result;
  return [
    'rescan',
    `${countOf(music.itemCount, 'track')}, ${countOf(video.itemCount, 'video')} on disk`,
    `${formatCount(music.missing + video.missing)} missing`,
    formatBytes(music.sizeBytes + video.sizeBytes),
  ].join(' · ');
}

/** History details of a rescan: what changed, or `no changes`. */
export function rescanDetails(result: RescanResult): string {
  const unknown = result.music.unknown + result.video.unknown;
  const parts = [
    result.newlyMissing > 0 && `${formatCount(result.newlyMissing)} newly missing`,
    result.restored > 0 && `${formatCount(result.restored)} back on disk`,
    result.resized > 0 && `${countOf(result.resized, 'size')} updated`,
    unknown > 0 && `${countOf(unknown, 'unknown file')} left alone`,
  ].filter((part) => part !== false);
  return parts.length > 0 ? parts.join(', ') : 'no changes';
}

/** History title of a backup: `backup · mytube-2026-09-26T04:00:00Z.sqlite · 12 MB`. */
export function backupTitle(result: BackupResult): string {
  return ['backup', result.file, formatBytes(result.sizeBytes)].join(' · ');
}

/**
 * `rescan` jobs: `RescanService.rescan` with a job log (every change and unknown file) and the
 * items checked as progress. Records one `system` history row with the totals.
 */
@Injectable()
export class RescanRunner implements JobRunner {
  readonly type = 'rescan';

  constructor(
    private readonly rescans: RescanService,
    private readonly logs: JobLogsService,
  ) {}

  async run(job: JobRow, { signal, progress }: JobContext): Promise<JobOutcome> {
    const log = this.logs.open(job);
    try {
      const result = await this.rescans.rescan({
        log: log.line,
        signal,
        progress: (fraction) => progress({ progress: Math.min(fraction, 0.99) }),
      });
      const outcome = { title: rescanTitle(result), details: rescanDetails(result) };
      log.line(`${outcome.title} (${outcome.details})`);
      return { kind: 'system', result: 'done', ...outcome };
    } catch (error) {
      log.line(`failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      log.close();
      this.logs.prune();
    }
  }
}

/**
 * `backup` jobs: `BackupService.backup` with the pages copied as progress. Records one `system`
 * history row naming the file.
 */
@Injectable()
export class BackupRunner implements JobRunner {
  readonly type = 'backup';

  constructor(
    private readonly backups: BackupService,
    private readonly logs: JobLogsService,
  ) {}

  async run(job: JobRow, { progress }: JobContext): Promise<JobOutcome> {
    const log = this.logs.open(job);
    try {
      const result = await this.backups.backup({
        log: log.line,
        progress: (fraction) => progress({ progress: Math.min(fraction, 0.99) }),
      });
      const removed = result.removed.length;
      return {
        kind: 'system',
        title: backupTitle(result),
        result: 'done',
        details:
          removed > 0 ? `${result.path}; removed ${countOf(removed, 'older backup')}` : result.path,
      };
    } catch (error) {
      log.line(`failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      log.close();
      this.logs.prune();
    }
  }
}
