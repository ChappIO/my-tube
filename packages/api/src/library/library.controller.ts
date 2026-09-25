import { Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import {
  HomeQuery,
  VideoListQuery,
  type HomeFeed,
  type LibrarySummary,
  type VideoListItem,
  type VideoPage,
} from '@mytube/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { sendFile } from '../files/send-file.js';
import { LibraryService } from './library.service.js';

@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  /** Videos (on disk by default), newest first, 60 per page with `cursor` pagination. */
  @Get('videos')
  videos(@Query(new ZodValidationPipe(VideoListQuery)) query: VideoListQuery): VideoPage {
    return this.library.listVideos(query);
  }

  /** One video with its channel (Preview). */
  @Get('videos/:id')
  video(@Param('id', ParseIntPipe) id: number): VideoListItem {
    return this.library.getVideo(id);
  }

  /** The file for Preview, with HTTP Range support. 404 when not on disk. */
  @Get('videos/:id/stream')
  async stream(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const target = this.library.streamTarget(id);
    await sendFile(res, target.path, { contentType: target.contentType });
  }

  /** Delete file: removes the file and its sidecars; the video stays known as deleted. */
  @Delete('videos/:id/file')
  @HttpCode(204)
  deleteFile(@Param('id', ParseIntPipe) id: number): void {
    this.library.deleteFile(id);
  }

  /** Home: the stat cards and what landed in the last `days` days, by local day. */
  @Get('home')
  home(@Query(new ZodValidationPipe(HomeQuery)) query: HomeQuery): HomeFeed {
    return this.library.home(query);
  }

  /** The Video header sub line. */
  @Get('summary')
  summary(): LibrarySummary {
    return this.library.summary();
  }
}
