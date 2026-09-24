import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { GithubReleases } from './github-releases.js';
import { YTDLP_BINARY } from './ytdlp-binary.js';
import { YtdlpBinaryService } from './ytdlp-binary.service.js';
import { YtdlpRunner } from './ytdlp-runner.js';
import { YtdlpController } from './ytdlp.controller.js';

/**
 * The yt-dlp binary manager (install, update checks, status endpoints) and the runner, the
 * only code that spawns yt-dlp. Needs `ScheduleModule.forRoot()` in the app for the update
 * tick and the global `ActivityModule` for history.
 */
@Module({
  imports: [SettingsModule],
  controllers: [YtdlpController],
  providers: [
    GithubReleases,
    YtdlpBinaryService,
    { provide: YTDLP_BINARY, useExisting: YtdlpBinaryService },
    YtdlpRunner,
  ],
  exports: [YtdlpRunner, YTDLP_BINARY, YtdlpBinaryService],
})
export class YtdlpModule {}
