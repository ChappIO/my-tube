import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  HomeQuery,
  PlayQuery,
  UNPLAYABLE_VIDEO_MESSAGE,
  VideoListQuery,
  type HomeFeed,
  type LibrarySummary,
  type SubtitleTrack,
  type VideoListItem,
  type VideoPage,
  type VideoPlayback,
} from '@mytube/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { sendFile } from '../files/send-file.js';
import { LibraryService } from './library.service.js';
import { PlaybackService } from './playback.service.js';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly playbackService: PlaybackService,
  ) {}

  /** Videos (on disk by default), newest first, 60 per page with `cursor` pagination. */
  @Get('videos')
  videos(@Query(new ZodValidationPipe(VideoListQuery)) query: VideoListQuery): VideoPage {
    return this.library.listVideos(query);
  }

  /** One video with its channel. */
  @Get('videos/:id')
  video(@Param('id', ParseIntPipe) id: number): VideoListItem {
    return this.library.getVideo(id);
  }

  /** The file as it is, with HTTP Range support. 404 when not on disk. */
  @Get('videos/:id/stream')
  async stream(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const target = this.library.streamTarget(id);
    await sendFile(res, target.path, { contentType: target.contentType });
  }

  /** How `/play` serves the video (direct, remux, unsupported) and what ffprobe knows. */
  @Get('videos/:id/playback')
  playback(@Param('id', ParseIntPipe) id: number): Promise<VideoPlayback> {
    return this.playbackService.playback(id);
  }

  /**
   * What the player loads: mp4 and webm redirect to `/stream`; an mkv with codecs an mp4 can
   * carry streams as a fragmented mp4 from `?t=` seconds; anything else is a 415.
   */
  @Get('videos/:id/play')
  async play(
    @Param('id', ParseIntPipe) id: number,
    @Query(new ZodValidationPipe(PlayQuery)) query: PlayQuery,
    @Res() res: Response,
  ): Promise<void> {
    const { path, playback } = await this.playbackService.playTarget(id);
    if (playback.mode === 'direct') {
      res.redirect(302, `/api/library/videos/${id}/stream`);
      return;
    }
    if (playback.mode === 'unsupported') {
      throw new UnsupportedMediaTypeException(UNPLAYABLE_VIDEO_MESSAGE);
    }
    await this.playbackService.remux(path, query.t, res);
  }

  /** The video's subtitle tracks: sidecar files, then embedded text streams. */
  @Get('videos/:id/subtitles')
  subtitles(@Param('id', ParseIntPipe) id: number): Promise<SubtitleTrack[]> {
    return this.playbackService.subtitles(id);
  }

  /** One subtitle track as WebVTT (`<index>.vtt`). */
  @Get('videos/:id/subtitles/:file')
  async subtitle(
    @Param('id', ParseIntPipe) id: number,
    @Param('file') file: string,
    @Res() res: Response,
  ): Promise<void> {
    const match = /^(\d{1,3})\.vtt$/.exec(file);
    if (!match) throw new NotFoundException(`No subtitle file ${file}`);
    const path = await this.playbackService.subtitleFile(id, Number(match[1]));
    await sendFile(res, path, { contentType: 'text/vtt; charset=utf-8' });
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
