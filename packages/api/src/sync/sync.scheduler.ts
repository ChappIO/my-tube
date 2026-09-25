import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SourcesService } from '../sources/sources.service.js';
import { RevalidationService } from './revalidation.service.js';
import { SyncService } from './sync.service.js';

/** How often the scheduler looks for sources due for a check. */
export const SYNC_TICK_MS = 5 * 60_000;

/**
 * Checks subscribed sources on the `general.checkIntervalHours` interval and revalidates their
 * files every 6 hours. A fixed 5-minute tick re-reads the setting and enqueues a `check_source`
 * and a `revalidate` job for every due source (the job key `source:<id>` de-duplicates per
 * type). A newly added source is checked at once; a source whose rules were saved is
 * revalidated at once.
 */
@Injectable()
export class SyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger('SyncScheduler');

  constructor(
    private readonly sync: SyncService,
    private readonly sources: SourcesService,
    private readonly revalidation: RevalidationService,
  ) {}

  onApplicationBootstrap(): void {
    this.sources.onCreated((source) => {
      if (source.subscribed) this.sync.enqueueCheck(source.id);
    });
    this.sources.onRulesChanged((source) => {
      this.revalidation.enqueue(source.id);
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
      let revalidations = 0;
      for (const source of this.revalidation.dueSources(now)) {
        if (this.revalidation.enqueue(source.id)?.created) revalidations++;
      }
      if (enqueued > 0) this.logger.log(`Enqueued ${enqueued} source check(s)`);
      if (revalidations > 0) this.logger.log(`Enqueued ${revalidations} revalidation(s)`);
      return enqueued;
    } catch (error) {
      this.logger.error(`Scheduling checks failed: ${String(error)}`);
      return 0;
    }
  }
}
