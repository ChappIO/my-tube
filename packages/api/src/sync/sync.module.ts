import { Module } from '@nestjs/common';
import { ArtworkModule } from '../artwork/artwork.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SourcesModule } from '../sources/sources.module.js';
import { YtdlpModule } from '../ytdlp/ytdlp.module.js';
import { AlbumCoverService } from './album-covers.service.js';
import { RevalidationService } from './revalidation.service.js';
import { SyncController } from './sync.controller.js';
import { SyncScheduler } from './sync.scheduler.js';
import { SyncService } from './sync.service.js';

/**
 * The sync: `SyncService` (fetch, diff, enqueue downloads), `RevalidationService` (files against
 * the current rules), `AlbumCoverService` (album covers against YouTube's expiring URLs), the
 * 5-minute `SyncScheduler`, the check endpoints and the rules preview.
 * `CheckSourceRunner` and `RevalidateRunner` are registered with the jobs module in `AppModule`.
 * Needs the global `JobsModule` for `JobsService`.
 */
@Module({
  imports: [SettingsModule, SourcesModule, YtdlpModule, ArtworkModule],
  controllers: [SyncController],
  providers: [AlbumCoverService, SyncService, RevalidationService, SyncScheduler],
  exports: [SyncService, RevalidationService],
})
export class SyncModule {}
