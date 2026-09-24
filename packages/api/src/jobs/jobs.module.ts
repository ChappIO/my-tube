import { type DynamicModule, Module, type ModuleMetadata, type Type } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { JOB_RUNNERS, type JobRunner } from './job-runner.js';
import { JobsService } from './jobs.service.js';
import { JobsWorker } from './jobs.worker.js';

export interface JobsModuleOptions {
  /** Modules the runners need (YtdlpModule, SourcesModule, …). */
  imports?: ModuleMetadata['imports'];
  /** Runner classes, one per job type. They are providers here and may inject JobsService. */
  runners?: Type<JobRunner>[];
}

/**
 * The jobs queue and worker. Global, so any module can inject `JobsService` to enqueue work.
 * Register it once in `AppModule` with the runners:
 *
 * ```ts
 * JobsModule.forRoot({ imports: [YtdlpModule], runners: [DownloadRunner, CheckSourceRunner] })
 * ```
 *
 * The runners are collected into the `JOB_RUNNERS` array the worker reads.
 */
@Module({})
export class JobsModule {
  static forRoot(options: JobsModuleOptions = {}): DynamicModule {
    const runners = options.runners ?? [];
    return {
      module: JobsModule,
      global: true,
      imports: [SettingsModule, ...(options.imports ?? [])],
      providers: [
        JobsService,
        JobsWorker,
        ...runners,
        {
          provide: JOB_RUNNERS,
          inject: runners,
          useFactory: (...list: JobRunner[]): JobRunner[] => list,
        },
      ],
      exports: [JobsService],
    };
  }
}
