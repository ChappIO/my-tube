import { Module } from '@nestjs/common';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { CookiesService } from './cookies.service.js';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

/**
 * `/api/system`: instance info, log download, the maintenance status and actions, and the
 * managed cookies file.
 */
@Module({
  imports: [MaintenanceModule, SettingsModule],
  controllers: [SystemController],
  providers: [SystemService, CookiesService],
})
export class SystemModule {}
