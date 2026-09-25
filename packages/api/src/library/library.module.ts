import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { MusicLibraryController } from './music-library.controller.js';
import { MusicLibraryService } from './music-library.service.js';

/**
 * The library read models (videos list, the Music tabs, Home, summary) and Preview's file
 * actions (stream, delete) for videos and tracks. Uses the global `JobsService` for the queue
 * count and `HistoryService`.
 */
@Module({
  controllers: [LibraryController, MusicLibraryController],
  providers: [LibraryService, MusicLibraryService],
})
export class LibraryModule {}
