import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { SourcesModule } from '../sources/sources.module.js';
import { YtdlpModule } from '../ytdlp/ytdlp.module.js';
import { SyncController } from './sync.controller.js';
import { SyncScheduler } from './sync.scheduler.js';
import { SyncService } from './sync.service.js';

/**
 * The sync: `SyncService` (fetch, diff, enqueue downloads), the 5-minute `SyncScheduler` and the
 * check endpoints. `CheckSourceRunner` is registered with the jobs module in `AppModule`. Needs
 * the global `JobsModule` for `JobsService`.
 */
@Module({
  imports: [SettingsModule, SourcesModule, YtdlpModule],
  controllers: [SyncController],
  providers: [SyncService, SyncScheduler],
  exports: [SyncService],
})
export class SyncModule {}
