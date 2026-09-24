import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { defaultBinaryLocator, YTDLP_BINARY } from './ytdlp-binary.js';
import { YtdlpRunner } from './ytdlp-runner.js';

@Module({
  providers: [
    // Replaced by the binary manager once it exists; see ytdlp-binary.ts.
    { provide: YTDLP_BINARY, inject: [AppConfig], useFactory: defaultBinaryLocator },
    YtdlpRunner,
  ],
  exports: [YtdlpRunner, YTDLP_BINARY],
})
export class YtdlpModule {}
