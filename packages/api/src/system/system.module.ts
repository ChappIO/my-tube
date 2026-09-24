import { Module } from '@nestjs/common';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

/** `/api/system`: instance info, log download, and the maintenance action stubs (Stage 7). */
@Module({
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
