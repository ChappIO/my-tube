import { Controller, Get, HttpException, HttpStatus, Post, StreamableFile } from '@nestjs/common';
import type { SystemActionResult, SystemInfo } from '@mytube/shared';
import { SystemService } from './system.service.js';

/** The download name of `GET /api/system/logs`. */
const LOGS_FILENAME = 'mytube.log';

/** Answer of the maintenance actions until Stage 7 implements them. */
const NOT_IMPLEMENTED: SystemActionResult = { message: 'Not implemented until Stage 7' };

@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  /** Version, mount paths and platform, shown read-only in Settings. */
  @Get('info')
  info(): SystemInfo {
    return this.system.info();
  }

  /**
   * The server log as a download (`text/plain`, attachment `mytube.log`): the log file when it
   * exists, otherwise a short note that logs go to stdout.
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

  /** Back up the database and settings now. Stub: 501 until Stage 7 (maintenance). */
  @Post('backup')
  backup(): never {
    throw new HttpException(NOT_IMPLEMENTED, HttpStatus.NOT_IMPLEMENTED);
  }

  /** Rescan both library mounts for on-disk and missing files. Stub: 501 until Stage 7. */
  @Post('rescan')
  rescan(): never {
    throw new HttpException(NOT_IMPLEMENTED, HttpStatus.NOT_IMPLEMENTED);
  }
}
