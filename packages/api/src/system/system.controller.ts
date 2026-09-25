import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  StreamableFile,
} from '@nestjs/common';
import type { MaintenanceStatus, SystemActionResult, SystemInfo } from '@mytube/shared';
import type { EnqueueResult } from '../jobs/jobs.service.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { SystemService } from './system.service.js';

/** The download name of `GET /api/system/logs`. */
const LOGS_FILENAME = 'mytube.log';

/**
 * The answer of a maintenance action: 202 with the new job, or 409 when one is already queued
 * or running (the body names that job).
 */
function actionResult(
  { job, created }: EnqueueResult,
  noun: { queued: string; busy: string },
): SystemActionResult {
  if (created) return { message: noun.queued, jobId: job.id };
  const message = `${noun.busy} is already ${job.status === 'running' ? 'running' : 'queued'}.`;
  throw new HttpException({ message, jobId: job.id }, HttpStatus.CONFLICT);
}

@Controller('system')
export class SystemController {
  constructor(
    private readonly system: SystemService,
    private readonly maintenance: MaintenanceService,
  ) {}

  /** Version, mount paths and platform, shown read-only in Settings. */
  @Get('info')
  info(): SystemInfo {
    return this.system.info();
  }

  /**
   * The server log as a download (`text/plain`, attachment `mytube.log`): the log file when it
   * exists (it does once the app logger wrote a line), otherwise a short note.
   */
  @Get('logs')
  logs(): StreamableFile {
    const logs = this.system.logs();
    const options = {
      type: 'text/plain; charset=utf-8',
      disposition: `attachment; filename="${LOGS_FILENAME}"`,
    };
    return logs.kind === 'file'
      ? new StreamableFile(logs.stream, { ...options, length: logs.size })
      : new StreamableFile(Buffer.from(logs.text, 'utf8'), options);
  }

  /** Library totals, the last rescan and the last backup (Settings → Library, → Data). */
  @Get('maintenance')
  maintenanceStatus(): MaintenanceStatus {
    return this.maintenance.status();
  }

  /** Back up the database (settings included) now: 202 with the job, 409 while one is queued. */
  @Post('backup')
  @HttpCode(HttpStatus.ACCEPTED)
  backup(): SystemActionResult {
    return actionResult(this.maintenance.enqueueBackup(), {
      queued: 'Backup queued.',
      busy: 'A backup',
    });
  }

  /** Rescan both library mounts now: 202 with the job, 409 while one is queued or running. */
  @Post('rescan')
  @HttpCode(HttpStatus.ACCEPTED)
  rescan(): SystemActionResult {
    return actionResult(this.maintenance.enqueueRescan(), {
      queued: 'Rescan queued.',
      busy: 'A rescan',
    });
  }
}
