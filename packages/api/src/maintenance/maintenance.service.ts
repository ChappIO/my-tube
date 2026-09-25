import { Injectable } from '@nestjs/common';
import { BACKUP_KEEP, type MaintenanceStatus } from '@mytube/shared';
import { JobsService, type EnqueueResult } from '../jobs/jobs.service.js';
import { BackupService } from './backup.service.js';
import { RescanService } from './rescan.service.js';

/** Dedupe keys: one rescan and one backup at a time. */
export const RESCAN_KEY = 'rescan';
export const BACKUP_KEY = 'backup';

/**
 * Queues the maintenance jobs (from the endpoints and the daily schedule) and reports their
 * state for Settings.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly jobs: JobsService,
    private readonly rescans: RescanService,
    private readonly backups: BackupService,
  ) {}

  /** A `rescan` job, or the one already queued or running (`created: false`). */
  enqueueRescan(): EnqueueResult {
    return this.jobs.enqueue({
      type: 'rescan',
      key: RESCAN_KEY,
      payload: {
        title: 'Rescan libraries',
        subtitle: 'checking files on disk',
        historyKind: 'system',
      },
    });
  }

  /** A `backup` job, or the one already queued or running (`created: false`). */
  enqueueBackup(): EnqueueResult {
    return this.jobs.enqueue({
      type: 'backup',
      key: BACKUP_KEY,
      payload: {
        title: 'Back up the database',
        subtitle: 'copying to backups',
        historyKind: 'system',
      },
    });
  }

  status(): MaintenanceStatus {
    return {
      libraries: { music: this.rescans.stats('music'), video: this.rescans.stats('video') },
      rescan: {
        active: this.jobs.isActive('rescan', RESCAN_KEY),
        lastAt: this.jobs.lastDoneAt('rescan'),
      },
      backup: {
        active: this.jobs.isActive('backup', BACKUP_KEY),
        last: this.backups.latest(),
        keep: BACKUP_KEEP,
      },
    };
  }
}
