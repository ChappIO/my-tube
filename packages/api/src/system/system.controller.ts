import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Put,
  Req,
  StreamableFile,
} from '@nestjs/common';
import {
  COOKIES_MAX_BYTES,
  type CookiesStatus,
  type MaintenanceStatus,
  type SystemActionResult,
  type SystemInfo,
} from '@mytube/shared';
import type { Request } from 'express';
import { readTextBody } from '../common/read-text-body.js';
import type { EnqueueResult } from '../jobs/jobs.service.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { COOKIES_TOO_LARGE, CookiesFileError } from './cookies-file.js';
import { CookiesService } from './cookies.service.js';
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
    private readonly cookies: CookiesService,
  ) {}

  /** Version, mount paths and platform, shown read-only in Settings. */
  @Get('info')
  info(): SystemInfo {
    return this.system.info();
  }

  /** What yt-dlp's cookies file is (count, sites, dates), never its contents. */
  @Get('cookies')
  cookiesStatus(): CookiesStatus {
    return this.cookies.status();
  }

  /**
   * Stores a Netscape cookies file sent as the `text/plain` body in `CONFIG_DIR/cookies.txt`
   * (0600) and points `network.cookiesFile` at it. 400 when it is not a cookies file or has no
   * YouTube or Google cookies, 413 over 1 MB, 415 for another content type.
   */
  @Put('cookies')
  async saveCookies(@Req() req: Request): Promise<CookiesStatus> {
    const text = await readTextBody(req, COOKIES_MAX_BYTES, COOKIES_TOO_LARGE);
    try {
      return this.cookies.save(text);
    } catch (error) {
      if (error instanceof CookiesFileError) {
        throw new HttpException({ message: error.message }, error.status);
      }
      throw error;
    }
  }

  /** Removes the managed cookies file and clears the setting when it pointed there. */
  @Delete('cookies')
  removeCookies(): CookiesStatus {
    return this.cookies.remove();
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
