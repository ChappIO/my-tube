import { createReadStream, statSync } from 'node:fs';
import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import type { Job } from '@mytube/shared';
import { JobLogsService } from './job-logs.service.js';
import { JobsService, toJobDto } from './jobs.service.js';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly logs: JobLogsService,
  ) {}

  /** The job's yt-dlp log as `text/plain` (shown inline). 404 when the job wrote none. */
  @Get(':id/log')
  log(@Param('id', ParseIntPipe) id: number): StreamableFile {
    const path = this.logs.path(id);
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      throw new NotFoundException(`No log for job ${id}`);
    }
    return new StreamableFile(createReadStream(path), {
      type: 'text/plain; charset=utf-8',
      disposition: `inline; filename="job-${id}.log"`,
      length: size,
    });
  }

  /** Cancels a queued or running job (killing yt-dlp), or dismisses a failed one. 204. */
  @Post(':id/cancel')
  @HttpCode(204)
  cancel(@Param('id', ParseIntPipe) id: number): void {
    if (!this.jobs.cancel(id)) throw new NotFoundException(`Job ${id} not found`);
  }

  /**
   * Runs a failed or cancelled job again from scratch. Returns the queued job (or the job
   * already queued or running for the same item). 409 for a job that is not failed or cancelled.
   */
  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id', ParseIntPipe) id: number): Job {
    const before = this.jobs.get(id);
    if (!before) throw new NotFoundException(`Job ${id} not found`);
    if (before.status !== 'failed' && before.status !== 'cancelled') {
      throw new ConflictException(
        `Job ${id} is ${before.status}; only failed or cancelled jobs can be retried`,
      );
    }
    const job = this.jobs.retry(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return toJobDto(job);
  }
}
