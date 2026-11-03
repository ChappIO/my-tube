import { Module } from '@nestjs/common';
import { LibraryModule } from '../library/library.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { YtdlpModule } from '../ytdlp/ytdlp.module.js';
import { SubtitleEmbedder } from './embed.js';
import { SubtitlesController } from './subtitles.controller.js';
import { SubtitlesService } from './subtitles.service.js';

/**
 * Subtitles as a job of their own (backend skill "Subtitles"): `SubtitlesService` queues them
 * (the download runner after each video, Settings → Video for the ones still missing) and
 * `SubtitlesRunner` (registered with `JobsModule.forRoot`) runs them. `PlaybackService`'s
 * ffprobe tells which languages a file already carries.
 */
@Module({
  imports: [SettingsModule, YtdlpModule, LibraryModule],
  controllers: [SubtitlesController],
  providers: [SubtitlesService, SubtitleEmbedder],
  // The runner (a JobsModule provider) needs PlaybackService too.
  exports: [SubtitlesService, SubtitleEmbedder, LibraryModule],
})
export class SubtitlesModule {}
