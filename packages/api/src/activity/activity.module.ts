import { Global, Module } from '@nestjs/common';
import { HistoryService } from './history.service.js';

/**
 * Queue and history views. Global so any module (yt-dlp manager, jobs, retention) can record
 * history without importing it. The controller arrives with the Activity screen (Stage 4).
 */
@Global()
@Module({
  providers: [HistoryService],
  exports: [HistoryService],
})
export class ActivityModule {}
