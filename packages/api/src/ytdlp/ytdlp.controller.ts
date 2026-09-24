import { Controller, Get, HttpCode, HttpException, Post, Query } from '@nestjs/common';
import type { YtdlpStatus } from '@mytube/shared';
import { YtdlpBinaryService } from './ytdlp-binary.service.js';

@Controller('ytdlp')
export class YtdlpController {
  constructor(private readonly binary: YtdlpBinaryService) {}

  /** Installed and latest version, auto-update settings and what the manager is doing. */
  @Get('status')
  status(): YtdlpStatus {
    return this.binary.status();
  }

  /**
   * Looks up the latest release now. Installs nothing. A failed lookup is not an HTTP error:
   * the status carries it (`state: 'error'`, `error`).
   */
  @Post('check')
  @HttpCode(200)
  check(): Promise<YtdlpStatus> {
    return this.orStatus(this.binary.check());
  }

  /**
   * Installs the latest release when it is newer; `?force=true` reinstalls it regardless.
   * Failures are reported in the status like `check`; 409 when `YTDLP_PATH` is set.
   */
  @Post('update')
  @HttpCode(200)
  update(@Query('force') force?: string): Promise<YtdlpStatus> {
    return this.orStatus(this.binary.update({ force: force === 'true' || force === '1' }));
  }

  private async orStatus(operation: Promise<YtdlpStatus>): Promise<YtdlpStatus> {
    try {
      return await operation;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return this.binary.status();
    }
  }
}
