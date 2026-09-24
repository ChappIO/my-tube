import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const config = app.get(AppConfig);
  await app.listen(config.port, config.host);
  new Logger('Bootstrap').log(
    `MyTube ${config.version} listening on http://${config.host}:${config.port}`,
  );
}

await bootstrap();
