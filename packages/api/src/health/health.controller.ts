import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@mytube/shared';
import { AppConfig } from '../config/app-config.js';

@Controller('health')
export class HealthController {
  constructor(private readonly config: AppConfig) {}

  @Get()
  health(): HealthResponse {
    return {
      status: 'ok',
      version: this.config.version,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
