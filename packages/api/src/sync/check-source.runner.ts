import { Injectable } from '@nestjs/common';
import { JobLogsService } from '../jobs/job-logs.service.js';
import {
  PermanentJobError,
  type JobContext,
  type JobOutcome,
  type JobRow,
  type JobRunner,
} from '../jobs/job-runner.js';
import { SourceGoneError, SyncService } from './sync.service.js';

/**
 * `check_source` jobs (payload `{ sourceId, title }`): one sync of one source. A routine check
 * records nothing in history; a failed one does (the worker records it, linked to the log).
 */
@Injectable()
export class CheckSourceRunner implements JobRunner {
  readonly type = 'check_source';

  constructor(
    private readonly sync: SyncService,
    private readonly logs: JobLogsService,
  ) {}

  async run(job: JobRow, { signal }: JobContext): Promise<JobOutcome | null> {
    const sourceId = job.payload.sourceId;
    if (typeof sourceId !== 'number') throw new PermanentJobError('Job has no sourceId');
    const log = this.logs.open(job);
    try {
      await this.sync.checkSource(sourceId, { signal, log: log.line });
      return null;
    } catch (error) {
      log.line(`failed: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof SourceGoneError) throw new PermanentJobError(error.message);
      throw error;
    } finally {
      log.close();
      this.logs.prune();
    }
  }
}
