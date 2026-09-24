import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ActivityModule } from './activity/activity.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DownloadRunner } from './downloads/download.runner.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SourcesModule } from './sources/sources.module.js';
import { CheckSourceRunner } from './sync/check-source.runner.js';
import { SyncModule } from './sync/sync.module.js';
import { SystemModule } from './system/system.module.js';
import { WebModule } from './web/web.module.js';
import { YtdlpModule } from './ytdlp/ytdlp.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    LoggingModule,
    ScheduleModule.forRoot(),
    ActivityModule,
    HealthModule,
    // Queue and worker with the sync and download runners.
    JobsModule.forRoot({
      imports: [YtdlpModule, SyncModule],
      runners: [CheckSourceRunner, DownloadRunner],
    }),
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
