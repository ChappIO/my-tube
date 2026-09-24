import { type DynamicModule, Module, type ModuleMetadata, type Type } from '@nestjs/common';
import { ActivityController } from '../activity/activity.controller.js';
import { SettingsModule } from '../settings/settings.module.js';
import { JobLogsService } from './job-logs.service.js';
import { JOB_RUNNERS, type JobRunner } from './job-runner.js';
import { JobsController } from './jobs.controller.js';
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
 * The runners are collected into the `JOB_RUNNERS` array the worker reads. `JobLogsService`
 * (per-job yt-dlp logs) is exported with it; `JobsController` serves a job's log, cancel and
 * retry.
 */
@Module({})
export class JobsModule {
  static forRoot(options: JobsModuleOptions = {}): DynamicModule {
    const runners = options.runners ?? [];
    return {
      module: JobsModule,
      global: true,
      imports: [SettingsModule, ...(options.imports ?? [])],
      // The Activity endpoints read the queue, so they live with it.
      controllers: [JobsController, ActivityController],
      providers: [
        JobsService,
        JobsWorker,
        JobLogsService,
        ...runners,
        {
          provide: JOB_RUNNERS,
          inject: runners,
          useFactory: (...list: JobRunner[]): JobRunner[] => list,
        },
      ],
      exports: [JobsService, JobLogsService],
    };
  }
}
