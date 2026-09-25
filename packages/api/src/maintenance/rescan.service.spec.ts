import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULT_SOURCE_OPTIONS, and, type ItemStatus, type Library } from '@mytube/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJobsHarness } from '../../test/jobs-harness.js';
import { AppConfig } from '../config/app-config.js';
import { artists, channels, sources, tracks, videos } from '../database/schema.js';
import { isMediaFileName, listMediaFiles } from '../files/library-walk.js';
import { rescanDetails, rescanTitle } from './maintenance.runners.js';
import { RescanService } from './rescan.service.js';

describe('isMediaFileName', () => {
  it.each([
    ['Video (2026-09-01).mkv', true],
    ['01 Telescope.m4a', true],
    ['Song.OPUS', true],
    ['Video.mkv.part', false],
    ['Video.mkv.ytdl', false],
    ['Video.f137.mp4', false],
    ['Video.temp.mp4', false],
    ['.Song.tagging.m4a', false],
    ['.DS_Store', false],
    ['Video.jpg', false],
    ['Video.en.vtt', false],
    ['notes.txt', false],
  ])('%s → %s', (name, expected) => {
    expect(isMediaFileName(name)).toBe(expected);
  });
});

describe('RescanService', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mytube-rescan-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function setup() {
    const harness = createJobsHarness();
    const config = new AppConfig({
      CONFIG_DIR: join(root, 'config'),
      VIDEO_DIR: join(root, 'video'),
      MUSIC_DIR: join(root, 'music'),
    });
    const service = new RescanService(harness.db, config);
    const { db } = harness;

    const write = (library: Library, path: string, bytes: number) => {
      const absolute = join(library === 'music' ? config.musicDir : config.videoDir, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, 'x'.repeat(bytes));
      return absolute;
    };

    const addSource = (library: Library, sizeBytes = 0, itemCount = 0) =>
      db
        .insert(sources)
        .values({
          library,
          kind: library === 'music' ? 'artist' : 'channel',
          youtubeId: `UC${library}`,
          url: `https://www.youtube.com/channel/UC${library}`,
          name: library,
          matcher: and(),
          options: DEFAULT_SOURCE_OPTIONS,
          sizeBytes,
          itemCount,
        })
        .returning()
        .get();
    const channel = db
      .insert(channels)
      .values({ youtubeId: 'UCc', name: 'NASA' })
      .returning()
      .get();
    const artist = db.insert(artists).values({ name: 'Hiatus Kaiyote' }).returning().get();

    let count = 0;
    const addVideo = (
      sourceId: number | null,
      status: ItemStatus,
      filePath: string | null,
      fileSizeBytes: number | null,
    ) =>
      db
        .insert(videos)
        .values({
          channelId: channel.id,
          sourceId,
          youtubeId: `v${++count}`,
          title: `Video ${count}`,
          status,
          filePath,
          fileSizeBytes,
        })
        .returning()
        .get();
    const addTrack = (
      sourceId: number | null,
      status: ItemStatus,
      filePath: string | null,
      fileSizeBytes: number | null,
    ) =>
      db
        .insert(tracks)
        .values({
          artistId: artist.id,
          sourceId,
          youtubeId: `t${++count}`,
          title: `Track ${count}`,
          status,
          filePath,
          fileSizeBytes,
        })
        .returning()
        .get();
    const video = (id: number) => db.select().from(videos).where(eq(videos.id, id)).get()!;
    const track = (id: number) => db.select().from(tracks).where(eq(tracks.id, id)).get()!;
    const source = (id: number) => db.select().from(sources).where(eq(sources.id, id)).get()!;
    return {
      ...harness,
      config,
      service,
      write,
      addSource,
      addVideo,
      addTrack,
      video,
      track,
      source,
    };
  }

  it('marks an on-disk item whose file is gone missing and keeps its path', async () => {
    const t = setup();
    const nasa = t.addSource('video', 300, 2);
    t.write('video', 'NASA/Kept.mkv', 100);
    const kept = t.addVideo(nasa.id, 'on_disk', 'NASA/Kept.mkv', 100);
    const gone = t.addVideo(nasa.id, 'on_disk', 'NASA/Gone.mkv', 200);

    const result = await t.service.rescan();

    expect(t.video(kept.id).status).toBe('on_disk');
    expect(t.video(gone.id)).toMatchObject({ status: 'missing', filePath: 'NASA/Gone.mkv' });
    expect(result.newlyMissing).toBe(1);
    expect(result.video).toMatchObject({ itemCount: 1, missing: 1, sizeBytes: 100, unknown: 0 });
    // The source now owns one file of 100 bytes and one wanted-or-on-disk item.
    expect(t.source(nasa.id)).toMatchObject({ sizeBytes: 100, itemCount: 1 });
  });

  it('brings a missing item back on disk when its file reappears, with the new size', async () => {
    const t = setup();
    const artist = t.addSource('music');
    t.write('music', 'Hiatus Kaiyote/Choose Your Weapon/01 Telescope.m4a', 321);
    const back = t.addTrack(
      artist.id,
      'missing',
      'Hiatus Kaiyote/Choose Your Weapon/01 Telescope.m4a',
      100,
    );

    const result = await t.service.rescan();

    expect(t.track(back.id)).toMatchObject({ status: 'on_disk', fileSizeBytes: 321 });
    expect(result.restored).toBe(1);
    expect(result.music).toMatchObject({ itemCount: 1, missing: 0, sizeBytes: 321 });
    expect(t.source(artist.id)).toMatchObject({ sizeBytes: 321, itemCount: 1 });
  });

  it('stores a changed file size', async () => {
    const t = setup();
    t.write('video', 'NASA/Retagged.mkv', 150);
    const item = t.addVideo(null, 'on_disk', 'NASA/Retagged.mkv', 100);

    const result = await t.service.rescan();

    expect(t.video(item.id).fileSizeBytes).toBe(150);
    expect(result.resized).toBe(1);
  });

  it('counts unknown media files and never touches them; partials and sidecars are ignored', async () => {
    const t = setup();
    t.write('video', 'NASA/Known.mkv', 10);
    t.addVideo(null, 'on_disk', 'NASA/Known.mkv', 10);
    const stranger = t.write('video', 'Elsewhere/Stranger.mp4', 10);
    const song = t.write('music', 'Somebody/Song.flac', 10);
    t.write('video', 'NASA/Known.jpg', 10);
    t.write('video', 'NASA/Known.en.vtt', 10);
    t.write('video', 'NASA/Downloading.mkv.part', 10);
    t.write('video', 'NASA/Downloading.f137.mp4', 10);
    t.write('music', 'Somebody/.Song.tagging.flac', 10);
    t.write('video', '.hidden/Secret.mkv', 10);
    t.write('video', '@eaDir/Thumb.mkv', 10);
    const before = statSync(stranger).mtimeMs;

    const result = await t.service.rescan();

    expect(result.video.unknown).toBe(1);
    expect(result.music.unknown).toBe(1);
    expect(statSync(stranger).mtimeMs).toBe(before);
    expect(statSync(song).size).toBe(10);
    // Nothing was imported.
    expect(t.db.select().from(videos).all()).toHaveLength(1);
    expect(t.db.select().from(tracks).all()).toHaveLength(0);
    expect(readdirSync(join(t.config.videoDir, 'NASA')).toSorted()).toEqual([
      'Downloading.f137.mp4',
      'Downloading.mkv.part',
      'Known.en.vtt',
      'Known.jpg',
      'Known.mkv',
    ]);
  });

  it('leaves skipped, wanted and downloading items alone', async () => {
    const t = setup();
    const skipped = t.addVideo(null, 'skipped', null, null);
    const wanted = t.addVideo(null, 'wanted', null, null);
    const downloading = t.addVideo(null, 'downloading', 'NASA/Busy.mkv', null);

    await t.service.rescan();

    expect(t.video(skipped.id).status).toBe('skipped');
    expect(t.video(wanted.id).status).toBe('wanted');
    expect(t.video(downloading.id).status).toBe('downloading');
  });

  it('does not overwrite an item that changed while the rescan was checking it', async () => {
    const t = setup();
    const item = t.addVideo(null, 'on_disk', 'NASA/Removed.mkv', 100);
    const result = await t.service.rescan({
      // Revalidation removes the file and skips the item between the check and the write.
      progress: () => {
        t.db
          .update(videos)
          .set({ status: 'skipped', filePath: null })
          .where(eq(videos.id, item.id))
          .run();
      },
    });
    expect(t.video(item.id).status).toBe('skipped');
    expect(result.video.missing).toBe(0);
  });

  it('recounts every source, including those it found nothing wrong with', async () => {
    const t = setup();
    const nasa = t.addSource('video', 999, 42);
    t.write('video', 'NASA/A.mkv', 70);
    t.addVideo(nasa.id, 'on_disk', 'NASA/A.mkv', 70);
    t.addVideo(nasa.id, 'wanted', null, null);
    t.addVideo(nasa.id, 'skipped', null, null);

    await t.service.rescan();

    expect(t.source(nasa.id)).toMatchObject({ sizeBytes: 70, itemCount: 2 });
  });

  it('reports progress over the items checked', async () => {
    const t = setup();
    t.addVideo(null, 'on_disk', 'a.mkv', 1);
    t.addVideo(null, 'on_disk', 'b.mkv', 1);
    const seen: number[] = [];
    await t.service.rescan({ progress: (fraction) => seen.push(fraction) });
    expect(seen).toEqual([0.5, 1]);
  });

  it('writes the history line format', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) {
      t.write('music', `A/${i}.m4a`, 1_000_000);
      t.addTrack(null, 'on_disk', `A/${i}.m4a`, 1_000_000);
    }
    t.addVideo(null, 'on_disk', 'NASA/Gone.mkv', 5);
    t.write('video', 'Loose.mkv', 1);

    const result = await t.service.rescan();

    expect(rescanTitle(result)).toBe('rescan · 3 tracks, 0 videos on disk · 1 missing · 3 MB');
    expect(rescanDetails(result)).toBe('1 newly missing, 1 unknown file left alone');
    expect(rescanDetails(await t.service.rescan())).toBe('1 unknown file left alone');
  });
});

describe('listMediaFiles', () => {
  it('is empty for a missing mount', async () => {
    expect(await listMediaFiles(join(tmpdir(), 'mytube-does-not-exist'))).toEqual([]);
  });
});
