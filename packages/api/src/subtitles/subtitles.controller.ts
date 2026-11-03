import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { FetchSubtitlesResult, SubtitlesStatus } from '@mytube/shared';
import { SubtitlesService } from './subtitles.service.js';

/** Settings → Video → Subtitles: the catch-up for videos downloaded without subtitles. */
@Controller('subtitles')
export class SubtitlesController {
  constructor(private readonly subtitles: SubtitlesService) {}

  @Get('status')
  status(): SubtitlesStatus {
    return this.subtitles.status();
  }

  /** Queues a subtitle job for every video on disk without a run with the current languages. */
  @Post('fetch-missing')
  @HttpCode(202)
  fetchMissing(): FetchSubtitlesResult {
    return { queued: this.subtitles.enqueueMissing() };
  }
}
