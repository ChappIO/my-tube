import { Body, Controller, Get, Patch } from '@nestjs/common';
import { SettingsPatch, type Settings } from '@mytube/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Every setting, stored values merged over the defaults. */
  @Get()
  get(): Settings {
    return this.settings.get();
  }

  /** Changes the given fields and returns every setting. */
  @Patch()
  patch(@Body(new ZodValidationPipe(SettingsPatch)) body: SettingsPatch): Settings {
    return this.settings.patch(body);
  }
}
