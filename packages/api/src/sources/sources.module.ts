import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { YtdlpModule } from '../ytdlp/ytdlp.module.js';
import { SourcesController } from './sources.controller.js';
import { SourcesService } from './sources.service.js';

/** URL resolution, source records, rules and the subscribe toggle. */
@Module({
  imports: [SettingsModule, YtdlpModule],
  controllers: [SourcesController],
  providers: [SourcesService],
  exports: [SourcesService],
})
export class SourcesModule {}
