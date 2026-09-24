import { Controller, HttpCode, NotFoundException, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { Job } from '@mytube/shared';
import { toJobDto } from '../jobs/jobs.service.js';
import { SyncService } from './sync.service.js';

@Controller()
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Checks one source now (whether subscribed or not). 202 with the queued or running job. */
  @Post('sources/:id/check')
  @HttpCode(202)
  check(@Param('id', ParseIntPipe) id: number): Job {
    const result = this.sync.enqueueCheck(id);
    if (!result) throw new NotFoundException(`Source ${id} not found`);
    return toJobDto(result.job);
  }

  /** Checks every subscribed source now. 202 with their jobs. */
  @Post('sync/check-all')
  @HttpCode(202)
  checkAll(): Job[] {
    return this.sync.enqueueAll().map(toJobDto);
  }
}
