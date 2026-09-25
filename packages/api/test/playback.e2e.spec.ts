import { get } from 'node:http';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  DEFAULT_SOURCE_OPTIONS,
  SubtitleTrack,
  UNPLAYABLE_VIDEO_MESSAGE,
  VideoPlayback,
  and,
} from '@mytube/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { channels, sources, videos } from '../src/database/schema.js';

/*
 * The video player's endpoints (`/playback`, `/play`, `/subtitles`) against files in a temp
 * VIDEO_DIR and the fake ffprobe and ffmpeg: a test "media file" holds the JSON ffprobe answers
 * for it, and the fake ffmpeg records its arguments.
 */

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const FAKE_YTDLP = fixture('fake-yt-dlp');

/** ffprobe's answer for a file with these streams. */
function probe(streams: Array<Record<string, unknown>>, duration = '61.500000'): string {
  return JSON.stringify({ streams, format: { duration } });
}

const h264 = { codec_type: 'video', codec_name: 'h264', width: 854, height: 480 };
const aac = { codec_type: 'audio', codec_name: 'aac' };
const cover = { codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } };

describe('Playback (e2e)', () => {
  let app: INestApplication;
  let root: string;
  let db: Database;
  const server = () => app.getHttpServer();
  const videoDir = () => join(root, 'video');
  const probeLog = () => join(root, 'ffprobe.log');
  const ffmpegArgs = () => join(root, 'ffmpeg.args');
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-playback-e2e-'));
    process.env.CONFIG_DIR = join(root, 'config');
    process.env.VIDEO_DIR = videoDir();
    process.env.MUSIC_DIR = join(root, 'music');
    process.env.YTDLP_PATH = FAKE_YTDLP;
    process.env.FFPROBE_PATH = fixture('fake-ffprobe');
    process.env.FFMPEG_PATH = fixture('fake-ffmpeg');
    process.env.FAKE_FFPROBE_LOG = probeLog();
    process.env.FAKE_FFMPEG_ARGS_FILE = ffmpegArgs();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    db = app.get<Database>(DATABASE);
    seed();
  });

  afterAll(async () => {
    await app.close();
    for (const name of [
      'CONFIG_DIR',
      'VIDEO_DIR',
      'MUSIC_DIR',
      'YTDLP_PATH',
      'FFPROBE_PATH',
      'FFMPEG_PATH',
      'FAKE_FFPROBE_LOG',
      'FAKE_FFMPEG_ARGS_FILE',
    ]) {
      delete process.env[name];
    }
    rmSync(root, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.FAKE_FFMPEG_HOLD;
    delete process.env.FAKE_FFMPEG_PID_FILE;
    delete process.env.FAKE_FFMPEG_FAIL;
  });

  function file(path: string, content: string) {
    const target = join(videoDir(), path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  function seed() {
    const sourceId = db
      .insert(sources)
      .values({
        library: 'video',
        kind: 'channel',
        youtubeId: 'UCnasa',
        url: 'https://www.youtube.com/channel/UCnasa',
        name: 'NASA',
        subscribed: false,
        matcher: and(),
        options: DEFAULT_SOURCE_OPTIONS,
      })
      .returning()
      .get().id;
    const channelId = db
      .insert(channels)
      .values({ youtubeId: 'UCnasa', name: 'NASA', sourceId })
      .returning()
      .get().id;
    const video = (name: string, path: string, content: string) => {
      file(path, content);
      ids[name] = db
        .insert(videos)
        .values({
          youtubeId: `yt-${name}`,
          title: name,
          channelId,
          sourceId,
          status: 'on_disk',
          filePath: path,
          fileSizeBytes: content.length,
        })
        .returning()
        .get().id;
    };
    video('direct', 'NASA/Direct.mp4', probe([{ ...h264, width: 1920, height: 1080 }, aac]));
    video(
      'remux',
      'NASA/Remux.mkv',
      probe([
        cover,
        h264,
        aac,
        { codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'eng' } },
        { codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle', tags: { language: 'nld' } },
        { codec_type: 'subtitle', codec_name: 'webvtt', tags: { title: 'Commentary' } },
      ]),
    );
    file('NASA/Remux.en.vtt', 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nsidecar en\n');
    file('NASA/Remux.nl.srt', '1\n00:00:00,000 --> 00:00:01,000\nsidecar nl\n');
    file('NASA/Remux.jpg', 'jpg');
    file('NASA/Remux (other).en.vtt', 'not this video');
    video(
      'vp9',
      'NASA/Vp9.mkv',
      probe([
        { ...h264, codec_name: 'vp9' },
        { ...aac, codec_name: 'opus' },
      ]),
    );
    video('hevc', 'NASA/Hevc.mkv', probe([{ ...h264, codec_name: 'hevc' }, aac]));
    video('garbage', 'NASA/Garbage.mkv', 'fake media');
    ids.wanted = db
      .insert(videos)
      .values({ youtubeId: 'yt-wanted', title: 'wanted', channelId, status: 'wanted' })
      .returning()
      .get().id;
  }

  const playback = async (name: string) =>
    VideoPlayback.parse(
      (await request(server()).get(`/api/library/videos/${ids[name]}/playback`).expect(200)).body,
    );

  /** The argv of every ffmpeg run so far. */
  const ffmpegRuns = (): string[][] =>
    existsSync(ffmpegArgs())
      ? readFileSync(ffmpegArgs(), 'utf8')
          .trim()
          .split('\n')
          .map((line) => z.array(z.string()).parse(JSON.parse(line)))
      : [];

  const tracks = async (name: string) =>
    z
      .array(SubtitleTrack)
      .parse(
        (await request(server()).get(`/api/library/videos/${ids[name]}/subtitles`).expect(200))
          .body,
      );

  const probes = (path: string) =>
    existsSync(probeLog())
      ? readFileSync(probeLog(), 'utf8')
          .split('\n')
          .filter((line) => line.endsWith(path)).length
      : 0;

  describe('GET /api/library/videos/:id/playback', () => {
    it('plays mp4 directly and says what ffprobe found', async () => {
      expect(await playback('direct')).toEqual({
        mode: 'direct',
        mimeType: 'video/mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        durationSeconds: 61.5,
        seekable: true,
      });
    });

    it('remuxes an mkv with codecs an mp4 carries, skipping the cover art stream', async () => {
      expect(await playback('remux')).toEqual({
        mode: 'remux',
        mimeType: 'video/mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 854,
        height: 480,
        durationSeconds: 61.5,
        seekable: false,
      });
      expect(await playback('vp9')).toMatchObject({ mode: 'remux', videoCodec: 'vp9' });
    });

    it('marks other codecs and unreadable files unsupported', async () => {
      expect(await playback('hevc')).toMatchObject({
        mode: 'unsupported',
        mimeType: 'video/x-matroska',
        videoCodec: 'hevc',
        seekable: false,
      });
      expect(await playback('garbage')).toMatchObject({
        mode: 'unsupported',
        videoCodec: null,
        durationSeconds: null,
      });
    });

    it('probes a file once until it changes', async () => {
      const path = 'NASA/Vp9.mkv';
      const before = probes(path);
      await playback('vp9');
      await playback('vp9');
      expect(probes(path)).toBe(before);
      const later = new Date(Date.now() + 5000);
      utimesSync(join(videoDir(), path), later, later);
      await playback('vp9');
      expect(probes(path)).toBe(before + 1);
    });

    it('is a 404 for videos not on disk', async () => {
      for (const id of [ids.wanted, 9999]) {
        const response = await request(server()).get(`/api/library/videos/${id}/playback`);
        expect(response.status).toBe(404);
      }
    });
  });

  describe('GET /api/library/videos/:id/play', () => {
    it('redirects mp4 to the file', async () => {
      const response = await request(server())
        .get(`/api/library/videos/${ids.direct}/play`)
        .expect(302);
      expect(response.headers.location).toBe(`/api/library/videos/${ids.direct}/stream`);
    });

    it('streams a remuxed mkv as mp4 from the start or from ?t=', async () => {
      const whole = await request(server())
        .get(`/api/library/videos/${ids.remux}/play`)
        .responseType('blob')
        .expect(200);
      expect(whole.headers['content-type']).toBe('video/mp4');
      expect(whole.headers['content-length']).toBeUndefined();
      expect(whole.headers['accept-ranges']).toBeUndefined();
      const body: unknown = whole.body;
      expect(Buffer.isBuffer(body) && body.toString()).toMatch(/^FMP4 /);
      const first = ffmpegRuns().at(-1)!;
      expect(first).not.toContain('-ss');
      expect(first.slice(first.indexOf('-i'))).toEqual([
        '-i',
        join(videoDir(), 'NASA/Remux.mkv'),
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c',
        'copy',
        '-sn',
        '-dn',
        '-movflags',
        'frag_keyframe+empty_moov+default_base_moof',
        '-f',
        'mp4',
        'pipe:1',
      ]);

      await request(server()).get(`/api/library/videos/${ids.remux}/play?t=42.5`).expect(200);
      const seeked = ffmpegRuns().at(-1)!;
      // `-ss` before `-i`: an input seek to the keyframe at or before 42.5 s.
      expect(seeked.indexOf('-ss')).toBeLessThan(seeked.indexOf('-i'));
      expect(seeked[seeked.indexOf('-ss') + 1]).toBe('42.5');
    });

    it('answers 415 for a file the browser cannot play', async () => {
      for (const name of ['hevc', 'garbage']) {
        const response = await request(server())
          .get(`/api/library/videos/${ids[name]}/play`)
          .expect(415);
        expect(response.body).toMatchObject({ message: UNPLAYABLE_VIDEO_MESSAGE });
      }
    });

    it('rejects a bad offset and answers 500 when ffmpeg fails', async () => {
      await request(server()).get(`/api/library/videos/${ids.remux}/play?t=-3`).expect(400);
      process.env.FAKE_FFMPEG_FAIL = '1';
      const failed = await request(server())
        .get(`/api/library/videos/${ids.remux}/play`)
        .expect(500);
      expect(z.object({ message: z.string() }).parse(failed.body).message).toMatch(
        /^ffmpeg could not remux this file \(exit 1\): /,
      );
    });

    it('kills ffmpeg when the player goes away', async () => {
      process.env.FAKE_FFMPEG_HOLD = '1';
      const pidFile = join(root, 'ffmpeg.pid');
      process.env.FAKE_FFMPEG_PID_FILE = pidFile;
      const base = await app.getUrl();
      await new Promise<void>((resolve, reject) => {
        const req = get(`${base}/api/library/videos/${ids.remux}/play`, (response) => {
          response.once('data', () => {
            req.destroy();
            resolve();
          });
        });
        req.on('error', (error) => {
          if (!req.destroyed) reject(error);
        });
      });
      const pid = Number(readFileSync(pidFile, 'utf8'));
      const alive = () => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      await expect.poll(alive, { timeout: 3000 }).toBe(false);
    });
  });

  describe('GET /api/library/videos/:id/subtitles', () => {
    it('lists sidecars by language, then the embedded text streams', async () => {
      const id = ids.remux!;
      expect(await tracks('remux')).toEqual([
        {
          lang: 'en',
          label: 'English',
          kind: 'sidecar',
          url: `/api/library/videos/${id}/subtitles/0.vtt`,
        },
        {
          lang: 'nl',
          label: 'Dutch',
          kind: 'sidecar',
          url: `/api/library/videos/${id}/subtitles/1.vtt`,
        },
        {
          lang: 'en',
          label: 'English',
          kind: 'embedded',
          url: `/api/library/videos/${id}/subtitles/2.vtt`,
        },
        // The PGS (bitmap) stream cannot become WebVTT; a stream without a language keeps its title.
        {
          lang: 'und',
          label: 'Commentary',
          kind: 'embedded',
          url: `/api/library/videos/${id}/subtitles/3.vtt`,
        },
      ]);
      expect(await tracks('direct')).toEqual([]);
    });

    it('serves a .vtt sidecar as it is', async () => {
      const response = await request(server())
        .get(`/api/library/videos/${ids.remux}/subtitles/0.vtt`)
        .expect(200);
      expect(response.headers['content-type']).toBe('text/vtt; charset=utf-8');
      expect(response.text).toContain('sidecar en');
    });

    it('converts srt sidecars and embedded streams once into the cache', async () => {
      const runs = ffmpegRuns().length;
      const srt = await request(server())
        .get(`/api/library/videos/${ids.remux}/subtitles/1.vtt`)
        .expect(200);
      expect(srt.text).toContain('Remux.nl.srt only stream');
      const embedded = await request(server())
        .get(`/api/library/videos/${ids.remux}/subtitles/3.vtt`)
        .expect(200);
      // The third subtitle stream of the file (the PGS one counts in ffmpeg's numbering).
      expect(embedded.text).toContain('Remux.mkv 0:s:2');
      expect(ffmpegRuns().at(-1)).toEqual(
        expect.arrayContaining(['-map', '0:s:2', '-f', 'webvtt']),
      );
      expect(existsSync(join(root, 'config/cache/subtitles', `${ids.remux}-3.vtt`))).toBe(true);
      expect(ffmpegRuns().length).toBe(runs + 2);

      await request(server()).get(`/api/library/videos/${ids.remux}/subtitles/3.vtt`).expect(200);
      expect(ffmpegRuns().length).toBe(runs + 2);

      // A changed file is converted again.
      const later = new Date(Date.now() + 10_000);
      utimesSync(join(videoDir(), 'NASA/Remux.mkv'), later, later);
      await request(server()).get(`/api/library/videos/${ids.remux}/subtitles/3.vtt`).expect(200);
      expect(ffmpegRuns().length).toBe(runs + 3);
    });

    it('is a 404 for unknown tracks', async () => {
      for (const path of [
        `/api/library/videos/${ids.remux}/subtitles/9.vtt`,
        `/api/library/videos/${ids.remux}/subtitles/x.vtt`,
        `/api/library/videos/${ids.wanted}/subtitles`,
      ]) {
        expect((await request(server()).get(path)).status).toBe(404);
      }
    });
  });
});
