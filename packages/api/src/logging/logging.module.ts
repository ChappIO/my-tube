import { join } from 'node:path';
import {
  Global,
  Injectable,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SettingsService } from '../settings/settings.service.js';
import { AppLogger } from './app-logger.js';

/** `CONFIG_DIR/logs/mytube.log`: the application log file (`GET /api/system/logs`). */
export function appLogFile(config: AppConfig): string {
  return join(config.configDir, 'logs', 'mytube.log');
}

/** Applies `data.logLevel` to the logger at boot and after every settings change. */
@Injectable()
export class LogLevelSync implements OnModuleInit, OnModuleDestroy {
  private off: (() => void) | undefined;

  constructor(
    private readonly logger: AppLogger,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.logger.setLevel(this.settings.get().data.logLevel);
    this.off = this.settings.onChange((settings) => this.logger.setLevel(settings.data.logLevel));
  }

  onModuleDestroy(): void {
    this.off?.();
    this.logger.close();
  }
}

/**
 * The application logger (`AppLogger`: stdout plus the rotating log file). `main.ts` creates the
 * app with `bufferLogs: true` and hands this instance to `app.useLogger`, so boot messages
 * reach the file too.
 */
@Global()
@Module({
  imports: [SettingsModule],
  providers: [
    {
      provide: AppLogger,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => new AppLogger(appLogFile(config)),
    },
    LogLevelSync,
  ],
  exports: [AppLogger],
})
export class LoggingModule {}
