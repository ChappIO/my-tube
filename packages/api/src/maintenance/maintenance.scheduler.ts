import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MaintenanceService } from './maintenance.service.js';

/** Daily database backup, 04:00 in the container's time zone (`TZ`). */
export const BACKUP_CRON = '0 4 * * *';
/** Daily rescan of both libraries, 04:30 in the container's time zone (`TZ`). */
export const RESCAN_CRON = '30 4 * * *';

/**
 * The nightly maintenance: a backup at 04:00 and a rescan at 04:30 (server local time, which is
 * `TZ` in the container). Fixed hours; nothing in Settings changes them.
 */
@Injectable()
export class MaintenanceScheduler {
  private readonly logger = new Logger('MaintenanceScheduler');

  constructor(private readonly maintenance: MaintenanceService) {}

  @Cron(BACKUP_CRON)
  backup(): void {
    try {
      if (this.maintenance.enqueueBackup().created) this.logger.log('Enqueued the daily backup');
    } catch (error) {
      this.logger.error(`Scheduling the backup failed: ${String(error)}`);
    }
  }

  @Cron(RESCAN_CRON)
  rescan(): void {
    try {
      if (this.maintenance.enqueueRescan().created) this.logger.log('Enqueued the daily rescan');
    } catch (error) {
      this.logger.error(`Scheduling the rescan failed: ${String(error)}`);
    }
  }
}
