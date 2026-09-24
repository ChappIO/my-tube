import { existsSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { YtdlpModule } from './ytdlp/ytdlp.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    YtdlpModule,
    // Serves the built web app when it exists (production). In development Vite serves it.
    ServeStaticModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        existsSync(config.webDist)
          ? [{ rootPath: config.webDist, exclude: ['/api/{*splat}'] }]
          : [],
    }),
  ],
})
export class AppModule {}
