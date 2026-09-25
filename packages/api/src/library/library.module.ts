import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';

/**
 * The library read models (videos list, Home, summary) and Preview's file actions (stream,
 * delete). Uses the global `JobsService` for the queue count and `HistoryService`.
 */
@Module({
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
