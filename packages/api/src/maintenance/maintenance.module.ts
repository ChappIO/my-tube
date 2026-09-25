import { Module } from '@nestjs/common';
import { BackupService } from './backup.service.js';
import { MaintenanceScheduler } from './maintenance.scheduler.js';
import { MaintenanceService } from './maintenance.service.js';
import { RescanService } from './rescan.service.js';

/**
 * Rescan and backups: the services, the nightly schedule and the status for Settings. The
 * `rescan` and `backup` runners (`maintenance.runners.ts`) are registered with the jobs module in
 * `AppModule`, which imports this module for them. `JobsService` is global.
 */
@Module({
  providers: [RescanService, BackupService, MaintenanceService, MaintenanceScheduler],
  exports: [RescanService, BackupService, MaintenanceService],
})
export class MaintenanceModule {}
