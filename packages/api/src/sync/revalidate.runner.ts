import { Injectable } from '@nestjs/common';
import { JobLogsService } from '../jobs/job-logs.service.js';
import {
  PermanentJobError,
  type JobContext,
  type JobOutcome,
  type JobRow,
  type JobRunner,
} from '../jobs/job-runner.js';
import { RevalidationService } from './revalidation.service.js';
import { SourceGoneError } from './sync.service.js';

/**
 * `revalidate` jobs (payload `{ sourceId, title }`): compares one source's items with its current
 * rules and removes files that no longer match. Every removed file gets its own `removed`
 * history row (linked to this job's log); the job itself records nothing (resolves null).
 */
@Injectable()
export class RevalidateRunner implements JobRunner {
  readonly type = 'revalidate';

  constructor(
    private readonly revalidation: RevalidationService,
    private readonly logs: JobLogsService,
  ) {}

  async run(job: JobRow, { signal }: JobContext): Promise<JobOutcome | null> {
    const sourceId = job.payload.sourceId;
    if (typeof sourceId !== 'number') throw new PermanentJobError('Job has no sourceId');
    const log = this.logs.open(job);
    try {
      this.revalidation.revalidate(sourceId, { jobId: job.id, log: log.line, signal });
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
