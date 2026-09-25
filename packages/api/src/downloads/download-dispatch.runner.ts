import { Injectable } from '@nestjs/common';
import type { JobContext, JobOutcome, JobRow, JobRunner } from '../jobs/job-runner.js';
import { DownloadRunner } from './download.runner.js';
import { TrackDownloadRunner } from './track-download.runner.js';

/**
 * The `download` job type's runner (one runner per type): a job with a `trackId` in its payload
 * is a track (`TrackDownloadRunner`), anything else a video (`DownloadRunner`, payload
 * `videoId`).
 */
@Injectable()
export class DownloadDispatchRunner implements JobRunner {
  readonly type = 'download';

  constructor(
    private readonly videos: DownloadRunner,
    private readonly tracks: TrackDownloadRunner,
  ) {}

  run(job: JobRow, ctx: JobContext): Promise<JobOutcome | null> {
    return typeof job.payload.trackId === 'number'
      ? this.tracks.run(job, ctx)
      : this.videos.run(job, ctx);
  }
}
