import { join } from 'node:path';
import {
  DEFAULT_MUSIC_MATCHER,
  DEFAULT_SOURCE_OPTIONS,
  DEFAULT_VIDEO_MATCHER,
  and,
  not,
  type Matcher,
} from '@mytube/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { createJobsHarness } from '../../test/jobs-harness.js';
import {
  channels,
  jobs as jobsTable,
  playlistItems,
  playlists,
  sources,
  videos,
} from '../database/schema.js';
import { YtdlpRunner } from '../ytdlp/ytdlp-runner.js';
import type { RuleVerdict } from './rules.js';
import { nextStatus, SourceGoneError, SyncService } from './sync.service.js';

const FAKE = join(import.meta.dirname, '../../test/fixtures/fake-yt-dlp');
const NASA = 'UCLA_DiR1FfKNvjuUpBHmylQ';
const PLAYLIST = 'PLB29CbKaE2OY';
const NOW = new Date('2026-09-24T12:00:00Z');

/** Video rules with only "no shorts", so the fixture's dates do not age out. */
const OPEN: Matcher = and(not({ type: 'is_short' }));

function setup() {
  const harness = createJobsHarness(NOW.toISOString());
  const runner = new YtdlpRunner({ path: () => FAKE });
  const sync = new SyncService(harness.db, runner, harness.settings, harness.jobs);
  const addSource = (
    kind: 'channel' | 'playlist' | 'artist',
    matcher: Matcher = OPEN,
    library: 'video' | 'music' = 'video',
  ) => {
    const youtubeId = kind === 'playlist' ? PLAYLIST : NASA;
    const url =
      kind === 'playlist'
        ? `https://www.youtube.com/playlist?list=${PLAYLIST}`
        : `https://www.youtube.com/channel/${NASA}`;
    const name = kind === 'playlist' ? 'NASA Moon Base' : 'NASA';
    const source = harness.db
      .insert(sources)
      .values({ library, kind, youtubeId, url, name, matcher, options: DEFAULT_SOURCE_OPTIONS })
      .returning()
      .get();
    if (kind === 'channel') {
      harness.db.insert(channels).values({ youtubeId, name, sourceId: source.id }).run();
    } else if (kind === 'playlist') {
      harness.db.insert(playlists).values({ library, youtubeId, name, sourceId: source.id }).run();
    }
    return source;
  };
  const video = (youtubeId: string) =>
    harness.db.select().from(videos).where(eq(videos.youtubeId, youtubeId)).get();
  const downloadJobs = () =>
    harness.db.select().from(jobsTable).where(eq(jobsTable.type, 'download')).all();
  return { ...harness, sync, addSource, video, downloadJobs };
}

/** A flat channel listing of NASA with these entries and their availability. */
const listing = (entries: { id: string; availability: string | null }[]) => ({
  kind: 'channel' as const,
  id: NASA,
  title: 'NASA',
  url: '',
  channel: 'NASA',
  channelId: NASA,
  channelUrl: null,
  uploaderUrl: null,
  thumbnailUrl: null,
  thumbnails: [],
  playlistCount: null,
  skippedEntries: 0,
  entries: entries.map(({ id, availability }) => ({
    kind: 'video' as const,
    id,
    title: id,
    url: `https://www.youtube.com/watch?v=${id}`,
    duration: 600,
    uploadDate: '2026-09-20',
    timestamp: null,
    liveStatus: null,
    availability,
    isShort: false,
    tab: 'videos' as const,
    channelId: null,
    channel: null,
    thumbnails: [],
    expectedStreams: [],
    expectedBytes: null,
  })),
});

describe('SyncService', () => {
  afterEach(() => {
    delete process.env.FAKE_YTDLP_FAIL;
    delete process.env.FAKE_YTDLP_ARGS_FILE;
  });

  it('records a channel listing and enqueues the accepted videos, newest first', async () => {
    const { sync, addSource, video, downloadJobs, db, jobs } = setup();
    const source = addSource('channel');
    const lines: string[] = [];

    const result = await sync.checkSource(source.id, { log: (line) => lines.push(line) });

    // 3 uploads + 1 finished stream accepted, 3 shorts skipped, 2 streams on air not stored.
    expect(result).toEqual({ entries: 9, added: 7, wanted: 4, queued: 4, synced: true });
    expect(video('IwZVXmQdX1E')).toMatchObject({
      status: 'wanted',
      sourceId: source.id,
      publishedAt: '2026-09-11',
      title: 'NASA Moon Base: The First Six Months',
      durationSeconds: 67,
    });
    expect(video('myZ9kn9MIWQ')).toMatchObject({ status: 'skipped', skipReason: 'no_match' });
    expect(video('M3HKLzjvKPc')).toBeUndefined();

    const queue = jobs.listQueue().filter((job) => job.type === 'download');
    expect(queue.map((job) => job.title)).toEqual([
      'Progress 96 Cargo Ship Docking',
      'NASA Moon Base: The First Six Months',
      'What It Takes',
      'Artemis III: Our Next Step Back to the Moon',
    ]);
    expect(downloadJobs()[0]).toMatchObject({
      dedupeKey: 'video:IwZVXmQdX1E',
      payload: { subtitle: 'NASA', historyKind: 'video', detail: 'best' },
    });

    const checked = db.select().from(sources).where(eq(sources.id, source.id)).get();
    expect(checked?.lastCheckedAt).not.toBeNull();
    expect(checked?.itemCount).toBe(4);
    // The first check asks for 200 entries per tab and logs the command and output.
    expect(lines[0]).toMatch(
      /^\$ .*--playlist-items 1:200 .*-- https:\/\/www\.youtube\.com\/channel\//,
    );
    expect(lines.at(-1)).toMatch(/Checked NASA: 9 entries, 7 new, 4 wanted, 4 queued/);
  });

  it('asks for fewer entries on later checks and does not enqueue twice', async () => {
    const { sync, addSource, downloadJobs } = setup();
    const source = addSource('channel');
    await sync.checkSource(source.id);
    const lines: string[] = [];
    const again = await sync.checkSource(source.id, { log: (line) => lines.push(line) });
    expect(again).toMatchObject({ added: 0, wanted: 4, queued: 0 });
    expect(lines[0]).toContain('--playlist-items 1:60');
    expect(downloadJobs()).toHaveLength(4);
  });

  it('re-evaluates known items when the rules change, but never touches files on disk', async () => {
    const { sync, addSource, video, db } = setup();
    const source = addSource('channel');
    await sync.checkSource(source.id);
    db.update(videos)
      .set({ status: 'on_disk', filePath: 'NASA/What It Takes (2026-09-11).mkv' })
      .where(eq(videos.youtubeId, '90Kgw_SvK4w'))
      .run();

    const onlyMoon = and({ type: 'title_contains', text: 'moon' });
    db.update(sources).set({ matcher: onlyMoon }).where(eq(sources.id, source.id)).run();
    await sync.checkSource(source.id);

    expect(video('90Kgw_SvK4w')?.status).toBe('on_disk');
    expect(video('jHKf1eHp3eQ')).toMatchObject({ status: 'wanted' }); // "…to the Moon"
    expect(video('v03RjDNwG1o')).toMatchObject({ status: 'skipped', skipReason: 'no_match' });
    // A short that was skipped as a short matches the new rules and becomes wanted.
    expect(video('VV_JW4iCni0')).toMatchObject({ status: 'wanted', skipReason: null });
  });

  it('does not re-enqueue a download that failed for good or was cancelled', async () => {
    const { sync, addSource, jobs, downloadJobs } = setup();
    const source = addSource('channel');
    await sync.checkSource(source.id);
    const [first, second] = downloadJobs();
    jobs.cancel(first!.id);
    jobs.claimNext(['download']);
    jobs.fail(second!.id, 'boom', { retryable: false });

    const again = await sync.checkSource(source.id);
    expect(again.queued).toBe(0);
    expect(downloadJobs()).toHaveLength(4);
  });

  it('stores playlist positions and creates channel rows for the uploaders', async () => {
    const { sync, addSource, db, video } = setup();
    const source = addSource('playlist');
    const result = await sync.checkSource(source.id);

    expect(result).toMatchObject({ entries: 4, added: 4, wanted: 4 });
    const channel = db.select().from(channels).where(eq(channels.youtubeId, NASA)).get();
    expect(channel).toMatchObject({ name: 'NASA', sourceId: null });
    expect(video('tQcNSJc8gEg')?.channelId).toBe(channel?.id);
    const items = db.select().from(playlistItems).orderBy(playlistItems.position).all();
    expect(items.map((item) => [item.position, item.videoId])).toEqual([
      [1, video('tQcNSJc8gEg')?.id],
      [2, video('yIlTwwJv1Ac')?.id],
      [3, video('BYH6W9iCs2E')?.id],
      [4, video('LZea4h8zxLY')?.id],
    ]);
    expect(db.select().from(playlists).get()?.itemCount).toBe(9);
    expect(sync.enqueueDownloads(source, [])).toBe(0);

    // A second check replaces the positions instead of adding rows.
    await sync.checkSource(source.id);
    expect(db.select().from(playlistItems).all()).toHaveLength(4);
  });

  it('lets playlist rules use the entry position and uploader', async () => {
    const { sync, addSource, video } = setup();
    const source = addSource(
      'playlist',
      and(
        { type: 'in_playlist_position_under', position: 3 },
        { type: 'channel_is', channel: 'nasa' },
      ),
    );
    const result = await sync.checkSource(source.id);
    expect(result).toMatchObject({ entries: 4, wanted: 2 });
    expect(video('tQcNSJc8gEg')?.status).toBe('wanted');
    expect(video('yIlTwwJv1Ac')?.status).toBe('wanted');
    expect(video('BYH6W9iCs2E')).toMatchObject({ status: 'skipped', skipReason: 'no_match' });
  });

  it('applies "not older than" against the check time', () => {
    const { sync, addSource } = setup();
    const source = addSource('channel', and(not({ type: 'older_than_days', days: 14 })));
    const channel = {
      kind: 'channel' as const,
      id: NASA,
      title: 'NASA',
      url: '',
      channel: 'NASA',
      channelId: NASA,
      channelUrl: null,
      uploaderUrl: null,
      thumbnailUrl: null,
      thumbnails: [],
      playlistCount: null,
      skippedEntries: 0,
      entries: [
        { date: '2026-09-20', id: 'new' },
        { date: '2026-09-01', id: 'old' },
      ].map(({ date, id }) => ({
        kind: 'video' as const,
        id,
        title: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        duration: 60,
        uploadDate: date,
        timestamp: null,
        liveStatus: null,
        availability: null,
        isShort: false,
        tab: 'videos' as const,
        channelId: null,
        channel: null,
        thumbnails: [],
        expectedStreams: [],
        expectedBytes: null,
      })),
    };
    const result = sync.applyListing(source, channel, NOW);
    expect(result.added).toBe(2);
    expect(result.wantedIds).toHaveLength(1);
  });

  it('skips members-only entries under the default video rules and keeps unavailable ones', () => {
    const { sync, addSource, video, db } = setup();
    const source = addSource('channel', DEFAULT_VIDEO_MATCHER);
    const first = sync.applyListing(
      source,
      listing([
        { id: 'public', availability: null },
        { id: 'members', availability: 'subscriber_only' },
        { id: 'early', availability: null },
        { id: 'refused', availability: null },
      ]),
      NOW,
    );
    expect(first.added).toBe(4);
    expect(video('public')).toMatchObject({ status: 'wanted', availability: null });
    expect(video('members')).toMatchObject({
      status: 'skipped',
      skipReason: 'no_match',
      availability: 'subscriber_only',
    });
    expect(first.wantedIds).toHaveLength(3);
    // A download that yt-dlp refused as members-only is unavailable for good.
    db.update(videos)
      .set({ status: 'skipped', skipReason: 'unavailable' })
      .where(eq(videos.youtubeId, 'refused'))
      .run();

    // Next check: "early" got its members badge, "members" was made public, "refused" is
    // listed as members-only now.
    const second = sync.applyListing(
      source,
      listing([
        { id: 'public', availability: null },
        { id: 'members', availability: null },
        { id: 'early', availability: 'subscriber_only' },
        { id: 'refused', availability: 'subscriber_only' },
      ]),
      NOW,
    );
    expect(video('early')).toMatchObject({ status: 'skipped', skipReason: 'no_match' });
    expect(video('members')).toMatchObject({ status: 'wanted', availability: null });
    expect(video('refused')).toMatchObject({
      status: 'skipped',
      skipReason: 'unavailable',
      availability: 'subscriber_only',
    });
    expect(second.wantedIds).toHaveLength(2);
  });

  it('syncs a music artist source through its releases (music-sync.spec.ts has the rest)', async () => {
    const { sync, addSource, db } = setup();
    const source = addSource('artist', DEFAULT_MUSIC_MATCHER, 'music');
    await expect(sync.checkSource(source.id)).resolves.toMatchObject({
      synced: true,
      entries: 4,
      added: 3,
      wanted: 3,
      queued: 3,
    });
    const checked = db.select().from(sources).get();
    expect(checked?.lastCheckedAt).not.toBeNull();
    expect(checked?.itemCount).toBe(3);
  });

  it('throws SourceGoneError for a removed source and rethrows yt-dlp failures', async () => {
    const { sync, addSource, db } = setup();
    await expect(sync.checkSource(99)).rejects.toBeInstanceOf(SourceGoneError);
    const source = addSource('channel');
    process.env.FAKE_YTDLP_FAIL = '1';
    await expect(sync.checkSource(source.id)).rejects.toThrow(/Video unavailable/);
    expect(db.select().from(sources).get()?.lastCheckedAt).toBeNull();
  });

  it('enqueues checks de-duplicated per source and finds due sources', async () => {
    const { sync, addSource, db, jobs, settings, advance, now } = setup();
    const source = addSource('channel');
    expect(sync.enqueueCheck(source.id)?.created).toBe(true);
    expect(sync.enqueueCheck(source.id)?.created).toBe(false);
    expect(sync.enqueueCheck(123)).toBeUndefined();
    expect(sync.enqueueAll()).toHaveLength(1);
    expect(sync.dueSources(now()).map((s) => s.id)).toEqual([source.id]);

    // Checked an hour ago with the default 2-hour interval: not due; 2 hours later it is.
    db.update(sources)
      .set({ lastCheckedAt: new Date(now().getTime() - 3_600_000).toISOString() })
      .run();
    expect(sync.dueSources(now())).toEqual([]);
    advance(3_600_000);
    expect(sync.dueSources(now())).toHaveLength(1);
    settings.patch({ general: { checkIntervalHours: 6 } });
    expect(sync.dueSources(now())).toEqual([]);

    // A check that failed for good waits for the next interval.
    db.update(sources).set({ lastCheckedAt: null }).run();
    const job = jobs.claimNext(['check_source'])!;
    jobs.fail(job.id, 'offline', { retryable: false });
    expect(sync.dueSources(now())).toEqual([]);

    // Unsubscribed sources are never due.
    db.update(sources).set({ subscribed: false }).run();
    advance(7 * 3_600_000);
    expect(sync.dueSources(now())).toEqual([]);
  });
});

describe('nextStatus', () => {
  const accept = { accept: true } as const;
  const reject: RuleVerdict = { accept: false, reason: 'no_match', transient: false, failing: [] };
  it('leaves downloaded, downloading, missing and unavailable items alone', () => {
    expect(nextStatus('on_disk', null, reject)).toEqual({ status: 'on_disk', skipReason: null });
    expect(nextStatus('downloading', null, reject).status).toBe('downloading');
    expect(nextStatus('missing', null, accept).status).toBe('missing');
    expect(nextStatus('skipped', 'unavailable', accept)).toEqual({
      status: 'skipped',
      skipReason: 'unavailable',
    });
    // A file the user deleted (Preview's former Delete file) is never downloaded again.
    expect(nextStatus('skipped', 'deleted_by_user', accept)).toEqual({
      status: 'skipped',
      skipReason: 'deleted_by_user',
    });
  });
  it('moves wanted and rule-skipped items with the verdict', () => {
    expect(nextStatus('wanted', null, reject)).toEqual({
      status: 'skipped',
      skipReason: 'no_match',
    });
    expect(nextStatus('skipped', 'no_match', accept)).toEqual({
      status: 'wanted',
      skipReason: null,
    });
    // A file revalidation removed comes back when the rules match it again.
    expect(nextStatus('skipped', 'no_longer_matches', accept).status).toBe('wanted');
  });
});
