import { Module } from '@nestjs/common';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

/** `/api/system`: instance info, log download, and the maintenance status and actions. */
@Module({
  imports: [MaintenanceModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
