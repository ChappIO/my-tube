import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module.js';
import { AlbumService } from './album.service.js';
import { ArtistService } from './artist.service.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { MusicLibraryController } from './music-library.controller.js';
import { MusicLibraryService } from './music-library.service.js';
import { PlaybackService } from './playback.service.js';

/**
 * The library read models (videos list, the Music tabs, the artist and album pages, Home, summary),
 * the streams of videos and tracks and the video player's playback (`PlaybackService`: the mkv
 * remux and subtitles). Uses the global `JobsService` for the queue count; the album page's
 * Download missing enqueues through the sync's music downloads (`SyncModule`).
 */
@Module({
  imports: [SyncModule],
  controllers: [LibraryController, MusicLibraryController],
  providers: [LibraryService, MusicLibraryService, AlbumService, ArtistService, PlaybackService],
})
export class LibraryModule {}
