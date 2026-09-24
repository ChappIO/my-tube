import { Global, Module } from '@nestjs/common';
import { HistoryService } from './history.service.js';

/**
 * Queue and history views. Global so any module (yt-dlp manager, jobs, retention) can record
 * history without importing it. `ActivityController` (queue, history, summary) needs the queue
 * too, so `JobsModule` registers it; this module stays usable without the jobs module.
 */
@Global()
@Module({
  providers: [HistoryService],
  exports: [HistoryService],
})
export class ActivityModule {}
