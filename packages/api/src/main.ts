import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import { AppLogger } from './logging/app-logger.js';

async function bootstrap(): Promise<void> {
  // Boot messages are buffered until the app logger (stdout plus CONFIG_DIR/logs/mytube.log,
  // at the stored log level) takes over.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(AppLogger));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const config = app.get(AppConfig);
  await app.listen(config.port, config.host);
  new Logger('Bootstrap').log(
    `MyTube ${config.version} listening on http://${config.host}:${config.port}`,
  );
}

await bootstrap();
