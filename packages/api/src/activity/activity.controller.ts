import { Controller, Get, Query } from '@nestjs/common';
import { HistoryQuery, type ActivitySummary, type HistoryEntry, type Job } from '@mytube/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { JobsService } from '../jobs/jobs.service.js';
import { HistoryService } from './history.service.js';

/** The Activity screen and the sidebar badge. Polled by the web; nothing here is pushed. */
@Controller('activity')
export class ActivityController {
  constructor(
    private readonly jobs: JobsService,
    private readonly history: HistoryService,
  ) {}

  /** Running jobs, then queued ones in pick order, then jobs failed in the last day. */
  @Get('queue')
  queue(): Job[] {
    return this.jobs.queueView();
  }

  /** The newest history entries first; `?limit=` 1 to 500, default 100. */
  @Get('history')
  recent(@Query(new ZodValidationPipe(HistoryQuery)) query: HistoryQuery): HistoryEntry[] {
    return this.history.recent(query.limit);
  }

  /** Counts for the badge. */
  @Get('summary')
  summary(): ActivitySummary {
    return this.jobs.summary();
  }
}
