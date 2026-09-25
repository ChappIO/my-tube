import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module.js';
import { AlbumService } from './album.service.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { MusicLibraryController } from './music-library.controller.js';
import { MusicLibraryService } from './music-library.service.js';

/**
 * The library read models (videos list, the Music tabs, the album page, Home, summary) and
 * Preview's file actions (stream, delete) for videos and tracks. Uses the global `JobsService`
 * for the queue count and `HistoryService`; the album page's Download missing enqueues through
 * the sync's music downloads (`SyncModule`).
 */
@Module({
  imports: [SyncModule],
  controllers: [LibraryController, MusicLibraryController],
  providers: [LibraryService, MusicLibraryService, AlbumService],
})
export class LibraryModule {}
