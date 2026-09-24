import { HistoryService } from '../src/activity/history.service.js';
import { MIGRATIONS_DIR, openDatabase } from '../src/database/database.module.js';
import { runMigrations } from '../src/database/migrate.js';
import { SettingsService } from '../src/settings/settings.service.js';
import { JobsService } from '../src/jobs/jobs.service.js';

/** An in-memory database with the real services and a clock the test moves by hand. */
export function createJobsHarness(start = '2026-09-24T12:00:00.000Z') {
  const { db, client } = openDatabase(':memory:');
  runMigrations(client, MIGRATIONS_DIR);
  let now = new Date(start);
  const history = new HistoryService(db);
  const jobs = new JobsService(db, history, () => now);
  const settings = new SettingsService(db);
  return {
    db,
    client,
    history,
    jobs,
    settings,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    now: () => now,
  };
}

/** A promise with its resolve and reject exposed. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending promise callbacks and microtasks run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}
