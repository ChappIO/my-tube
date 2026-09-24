import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  DEFAULT_SOURCE_OPTIONS,
  and,
  not,
  type ItemStatus,
  type Matcher,
  type SkipReason,
} from '@mytube/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJobsHarness } from '../../test/jobs-harness.js';
import { AppConfig } from '../config/app-config.js';
import {
  channels,
  jobs as jobsTable,
  playlistItems,
  playlists,
  sources,
  videos,
} from '../database/schema.js';
import { YtdlpRunner } from '../ytdlp/ytdlp-runner.js';
import { REVALIDATE_INTERVAL_MS, RevalidationService } from './revalidation.service.js';
import { SourceGoneError, SyncService } from './sync.service.js';

const NOW = new Date();
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);

/** "Not older than 30 days": a file from 40 days ago no longer matches. */
const RECENT: Matcher = and(not({ type: 'older_than_days', days: 30 }));

describe('RevalidationService', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mytube-revalidate-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function setup() {
    const harness = createJobsHarness(NOW.toISOString());
    const config = new AppConfig({
      CONFIG_DIR: join(root, 'config'),
      VIDEO_DIR: join(root, 'video'),
      MUSIC_DIR: join(root, 'music'),
    });
    const sync = new SyncService(
      harness.db,
      new YtdlpRunner({ path: () => 'unused' }),
      harness.settings,
      harness.jobs,
    );
    const service = new RevalidationService(
      harness.db,
      config,
      harness.history,
      harness.jobs,
      sync,
    );
    let channelCount = 0;
    const addSource = (matcher: Matcher = RECENT, kind: 'channel' | 'playlist' = 'channel') => {
      channelCount++;
      const youtubeId = kind === 'playlist' ? `PL${channelCount}` : `UC${channelCount}`;
      const source = harness.db
        .insert(sources)
        .values({
          library: 'video',
          kind,
          youtubeId,
          url: `https://www.youtube.com/channel/${youtubeId}`,
          name: `Channel ${channelCount}`,
          matcher,
          options: DEFAULT_SOURCE_OPTIONS,
          sizeBytes: 1000,
        })
        .returning()
        .get();
      const channel = harness.db
        .insert(channels)
        .values({ youtubeId: `UCc${channelCount}`, name: `Channel ${channelCount}` })
        .returning()
        .get();
      return { source, channelId: channel.id };
    };
    let videoCount = 0;
    const addVideo = (
      owner: { source: { id: number }; channelId: number },
      fields: {
        title?: string;
        publishedAt?: string | null;
        status?: ItemStatus;
        skipReason?: SkipReason | null;
        file?: boolean;
      } = {},
    ) => {
      videoCount++;
      const status = fields.status ?? 'on_disk';
      const filePath = status === 'on_disk' ? `Channel/Video ${videoCount}.mkv` : null;
      if (filePath && fields.file !== false) {
        const absolute = join(config.videoDir, filePath);
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, 'x'.repeat(100));
      }
      return harness.db
        .insert(videos)
        .values({
          channelId: owner.channelId,
          sourceId: owner.source.id,
          youtubeId: `vid${videoCount}`,
          title: fields.title ?? `Video ${videoCount}`,
          publishedAt: 'publishedAt' in fields ? (fields.publishedAt ?? null) : daysAgo(1),
          status,
          skipReason: fields.skipReason ?? null,
          filePath,
          fileSizeBytes: filePath ? 100 : null,
        })
        .returning()
        .get();
    };
    const video = (id: number) => harness.db.select().from(videos).where(eq(videos.id, id)).get();
    const source = (id: number) =>
      harness.db.select().from(sources).where(eq(sources.id, id)).get();
    return { ...harness, config, service, addSource, addVideo, video, source };
  }

  it('removes files that no longer match, with their sidecars and empty folders', () => {
    const { service, addSource, addVideo, video, source, config, history } = setup();
    const owner = addSource();
    const old = addVideo(owner, { title: 'Old launch', publishedAt: daysAgo(40) });
    const dir = join(config.videoDir, 'Channel');
    writeFileSync(join(dir, 'Video 1.jpg'), 'thumb');
    writeFileSync(join(dir, 'Video 1.en.vtt'), 'subs');
    writeFileSync(join(dir, 'Video 1.notes.txt'), 'not a sidecar');
    const lines: string[] = [];

    const result = service.revalidate(owner.source.id, {
      jobId: undefined,
      log: (line) => lines.push(line),
    });

    expect(result).toEqual({ removed: 1, kept: 0, unwanted: 0, rewanted: 0, failed: 0 });
    expect(readdirSync(dir)).toEqual(['Video 1.notes.txt']);
    expect(video(old.id)).toMatchObject({
      status: 'skipped',
      skipReason: 'no_longer_matches',
      filePath: null,
      fileSizeBytes: null,
    });
    expect(source(owner.source.id)).toMatchObject({ sizeBytes: 900 });
    expect(source(owner.source.id)?.lastRevalidatedAt).not.toBeNull();
    expect(history.recent(5)).toMatchObject([
      {
        kind: 'video',
        title: 'Old launch',
        result: 'removed',
        details: 'no longer matches: not older than 30 days',
      },
    ]);
    expect(lines[0]).toBe(
      'removed Channel/Video 1.mkv (Video 1.mkv, Video 1.en.vtt, Video 1.jpg): no longer matches: not older than 30 days',
    );

    // The folder goes once it is empty; the library root stays.
    rmSync(join(dir, 'Video 1.notes.txt'));
    const other = addVideo(owner, { publishedAt: daysAgo(50) });
    service.revalidate(owner.source.id);
    expect(video(other.id)?.status).toBe('skipped');
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(config.videoDir)).toBe(true);
  });

  it('never touches files that still match or belong to another source', () => {
    const { service, addSource, addVideo, video, history, config } = setup();
    const owner = addSource();
    const neighbour = addSource(and());
    const fresh = addVideo(owner, { publishedAt: daysAgo(3) });
    const undated = addVideo(owner, { publishedAt: null });
    const foreign = addVideo(neighbour, { publishedAt: daysAgo(400) });

    const result = service.revalidate(owner.source.id);

    expect(result).toMatchObject({ removed: 0, kept: 2 });
    for (const item of [fresh, undated, foreign]) {
      expect(video(item.id)?.status).toBe('on_disk');
      expect(existsSync(join(config.videoDir, item.filePath ?? ''))).toBe(true);
    }
    expect(history.recent(5)).toEqual([]);
  });

  it('moves wanted items out and rule-skipped items back in, queueing their download', () => {
    const { service, addSource, addVideo, video, db } = setup();
    const owner = addSource(and({ type: 'title_contains', text: 'Artemis' }));
    const wanted = addVideo(owner, { title: 'Mars rover', status: 'wanted' });
    const back = addVideo(owner, {
      title: 'Artemis II',
      status: 'skipped',
      skipReason: 'no_match',
    });
    const removedBefore = addVideo(owner, {
      title: 'Artemis I',
      status: 'skipped',
      skipReason: 'no_longer_matches',
    });
    const unavailable = addVideo(owner, {
      title: 'Artemis III',
      status: 'skipped',
      skipReason: 'unavailable',
    });
    const missing = addVideo(owner, { title: 'Mars', status: 'missing' });
    const downloading = addVideo(owner, { title: 'Mars 2', status: 'downloading' });

    expect(service.revalidate(owner.source.id)).toMatchObject({ unwanted: 1, rewanted: 2 });

    expect(video(wanted.id)).toMatchObject({ status: 'skipped', skipReason: 'no_match' });
    expect(video(back.id)).toMatchObject({ status: 'wanted', skipReason: null });
    expect(video(removedBefore.id)).toMatchObject({ status: 'wanted', skipReason: null });
    expect(video(unavailable.id)).toMatchObject({ status: 'skipped', skipReason: 'unavailable' });
    expect(video(missing.id)?.status).toBe('missing');
    expect(video(downloading.id)?.status).toBe('downloading');
    const queued = db.select().from(jobsTable).where(eq(jobsTable.type, 'download')).all();
    expect(queued.map((job) => Number(job.payload.videoId)).toSorted((a, b) => a - b)).toEqual(
      [back.id, removedBefore.id].toSorted((a, b) => a - b),
    );
  });

  it('previews without changing anything', () => {
    const { service, addSource, addVideo, video, history } = setup();
    const owner = addSource(and());
    const old = addVideo(owner, { title: 'Old', publishedAt: daysAgo(40) });
    addVideo(owner, { title: 'New', publishedAt: daysAgo(2) });
    addVideo(owner, { title: 'Queued', publishedAt: daysAgo(90), status: 'wanted' });

    expect(service.preview(owner.source.id, RECENT)).toEqual({
      wouldRemove: [{ id: old.id, title: 'Old', failing: ['not older than 30 days'] }],
      wouldKeep: 1,
    });
    expect(video(old.id)?.status).toBe('on_disk');
    expect(history.recent(5)).toEqual([]);
    expect(() => service.preview(999, RECENT)).toThrow(/not found/);
  });

  it('sees playlist positions and uploaders', () => {
    const { service, addSource, addVideo, db } = setup();
    const owner = addSource(and({ type: 'in_playlist_position_under', position: 2 }), 'playlist');
    const playlist = db
      .insert(playlists)
      .values({ library: 'video', youtubeId: owner.source.youtubeId, name: 'List' })
      .returning()
      .get();
    const first = addVideo(owner);
    const second = addVideo(owner);
    db.insert(playlistItems)
      .values([
        { playlistId: playlist.id, position: 1, videoId: first.id },
        { playlistId: playlist.id, position: 2, videoId: second.id },
      ])
      .run();
    expect(service.preview(owner.source.id, owner.source.matcher)).toEqual({
      wouldRemove: [{ id: second.id, title: second.title, failing: ['first 1 entry'] }],
      wouldKeep: 1,
    });
    expect(
      service.preview(owner.source.id, and({ type: 'channel_is', channel: 'channel 1' })),
    ).toMatchObject({ wouldRemove: [], wouldKeep: 2 });
  });

  it('records a failed removal and keeps the item on disk', () => {
    const { service, addSource, addVideo, video, db, history } = setup();
    const owner = addSource();
    const escaping = addVideo(owner, { publishedAt: daysAgo(40), file: false });
    db.update(videos).set({ filePath: '../outside.mkv' }).where(eq(videos.id, escaping.id)).run();

    expect(service.revalidate(owner.source.id)).toMatchObject({ removed: 0, failed: 1 });
    expect(video(escaping.id)?.status).toBe('on_disk');
    expect(history.recent(1)[0]).toMatchObject({ result: 'failed' });
  });

  it('throws SourceGoneError for a removed source', () => {
    const { service } = setup();
    expect(() => service.revalidate(42)).toThrow(SourceGoneError);
  });

  it('enqueues de-duplicated jobs and finds subscribed sources due every 6 hours', () => {
    const { service, addSource, db, jobs, advance, now } = setup();
    const { source } = addSource();
    expect(service.enqueue(source.id)?.created).toBe(true);
    expect(service.enqueue(source.id)?.created).toBe(false);
    expect(service.enqueue(999)).toBeUndefined();
    expect(service.dueSources(now()).map((row) => row.id)).toEqual([source.id]);

    db.update(sources).set({ lastRevalidatedAt: now().toISOString() }).run();
    expect(service.dueSources(now())).toEqual([]);
    advance(REVALIDATE_INTERVAL_MS + 1);
    expect(service.dueSources(now())).toHaveLength(1);

    // A revalidation that failed for good waits a full interval.
    db.update(sources).set({ lastRevalidatedAt: null }).run();
    const job = jobs.claimNext(['revalidate']);
    if (job) jobs.fail(job.id, 'disk on fire', { retryable: false });
    expect(service.dueSources(now())).toEqual([]);

    // Unsubscribed sources are paused.
    db.update(sources).set({ subscribed: false }).run();
    advance(2 * REVALIDATE_INTERVAL_MS);
    expect(service.dueSources(now())).toEqual([]);
  });
});
