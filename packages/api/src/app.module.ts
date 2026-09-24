import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ActivityModule } from './activity/activity.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SourcesModule } from './sources/sources.module.js';
import { SystemModule } from './system/system.module.js';
import { WebModule } from './web/web.module.js';
import { YtdlpModule } from './ytdlp/ytdlp.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    ActivityModule,
    HealthModule,
    SettingsModule,
    SourcesModule,
    SystemModule,
    YtdlpModule,
    // Serves the built web app when it exists (production). In development Vite serves it.
    WebModule,
  ],
})
export class AppModule {}
