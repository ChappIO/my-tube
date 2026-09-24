import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SourcesService } from '../sources/sources.service.js';
import { SyncService } from './sync.service.js';

/** How often the scheduler looks for sources due for a check. */
export const SYNC_TICK_MS = 5 * 60_000;

/**
 * Checks subscribed sources on the `general.checkIntervalHours` interval. A fixed 5-minute
 * tick re-reads the setting and enqueues a `check_source` job for every due source (the job key
 * `source:<id>` de-duplicates). A newly added source is checked at once.
 */
@Injectable()
export class SyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger('SyncScheduler');

  constructor(
    private readonly sync: SyncService,
    private readonly sources: SourcesService,
  ) {}

  onApplicationBootstrap(): void {
    this.sources.onCreated((source) => {
      if (source.subscribed) this.sync.enqueueCheck(source.id);
    });
    this.tick();
  }

  @Interval(SYNC_TICK_MS)
  tick(now = new Date()): number {
    try {
      let enqueued = 0;
      for (const source of this.sync.dueSources(now)) {
        if (this.sync.enqueueCheck(source.id)?.created) enqueued++;
      }
      if (enqueued > 0) this.logger.log(`Enqueued ${enqueued} source check(s)`);
      return enqueued;
    } catch (error) {
      this.logger.error(`Scheduling checks failed: ${String(error)}`);
      return 0;
    }
  }
}
