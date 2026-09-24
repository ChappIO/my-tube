import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { WebModule } from './web/web.module.js';
import { YtdlpModule } from './ytdlp/ytdlp.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    SettingsModule,
    YtdlpModule,
    // Serves the built web app when it exists (production). In development Vite serves it.
    WebModule,
  ],
})
export class AppModule {}
