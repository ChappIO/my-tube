import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { SourcesModule } from '../sources/sources.module.js';
import { YtdlpModule } from '../ytdlp/ytdlp.module.js';
import { RevalidationService } from './revalidation.service.js';
import { SyncController } from './sync.controller.js';
import { SyncScheduler } from './sync.scheduler.js';
import { SyncService } from './sync.service.js';

/**
 * The sync: `SyncService` (fetch, diff, enqueue downloads), `RevalidationService` (files against
 * the current rules), the 5-minute `SyncScheduler`, the check endpoints and the rules preview.
 * `CheckSourceRunner` and `RevalidateRunner` are registered with the jobs module in `AppModule`.
 * Needs the global `JobsModule` for `JobsService`.
 */
@Module({
  imports: [SettingsModule, SourcesModule, YtdlpModule],
  controllers: [SyncController],
  providers: [SyncService, RevalidationService, SyncScheduler],
  exports: [SyncService, RevalidationService],
})
export class SyncModule {}
