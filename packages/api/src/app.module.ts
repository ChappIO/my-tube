import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ActivityModule } from './activity/activity.module.js';
import { ArtworkModule } from './artwork/artwork.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DownloadDispatchRunner } from './downloads/download-dispatch.runner.js';
import { DownloadRunner } from './downloads/download.runner.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LibraryModule } from './library/library.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { BackupRunner, RescanRunner } from './maintenance/maintenance.runners.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { MetadataModule } from './metadata/metadata.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SourcesModule } from './sources/sources.module.js';
import { CheckSourceRunner } from './sync/check-source.runner.js';
import { RevalidateRunner } from './sync/revalidate.runner.js';
import { SyncModule } from './sync/sync.module.js';
import { SystemModule } from './system/system.module.js';
import { TrackDownloadRunner } from './downloads/track-download.runner.js';
import { WebModule } from './web/web.module.js';
import { YtdlpModule } from './ytdlp/ytdlp.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    LoggingModule,
    ScheduleModule.forRoot(),
    ActivityModule,
    ArtworkModule,
    HealthModule,
    // Queue and worker with the sync, revalidation, download and maintenance runners. `download`
    // jobs go to the dispatcher, which hands videos to DownloadRunner and tracks to
    // TrackDownloadRunner.
    JobsModule.forRoot({
      imports: [YtdlpModule, SyncModule, MetadataModule, MaintenanceModule],
      runners: [
        CheckSourceRunner,
        RevalidateRunner,
        DownloadDispatchRunner,
        RescanRunner,
        BackupRunner,
      ],
      providers: [DownloadRunner, TrackDownloadRunner],
    }),
    LibraryModule,
    MaintenanceModule,
    SettingsModule,
    SourcesModule,
    SyncModule,
    SystemModule,
    YtdlpModule,
    // Serves the built web app when it exists (production). In development Vite serves it.
    WebModule,
  ],
})
export class AppModule {}
