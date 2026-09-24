import { describe, expect, it } from 'vitest';
import { DEFAULT_VIDEO_MATCHER } from './matchers.js';
import {
  CreateSource,
  RulesPreviewRequest,
  SourceOptionsInput,
  UpdateSource,
  guessLibrary,
  parseYoutubeUrl,
  uploadsPerWeek,
} from './sources.js';

const UC = 'UCLA_DiR1FfKNvjuUpBHmylQ';
const LIST = 'PLB29CbKaE2OY_example';

describe('parseYoutubeUrl', () => {
  it.each([
    ['https://www.youtube.com/@NASA', 'channel', '@NASA', 'https://www.youtube.com/@NASA'],
    ['youtube.com/@NASA/videos', 'channel', '@NASA', 'https://www.youtube.com/@NASA'],
    ['https://m.youtube.com/@NASA?si=abc', 'channel', '@NASA', 'https://www.youtube.com/@NASA'],
    ['  @NASA  ', 'channel', '@NASA', 'https://www.youtube.com/@NASA'],
    [
      `http://youtube.com/channel/${UC}/featured`,
      'channel',
      UC,
      `https://www.youtube.com/channel/${UC}`,
    ],
    ['https://www.youtube.com/c/NASA', 'channel', 'c/NASA', 'https://www.youtube.com/c/NASA'],
    [
      'https://www.youtube.com/user/NASAtelevision/videos',
      'channel',
      'user/NASAtelevision',
      'https://www.youtube.com/user/NASAtelevision',
    ],
    [
      `https://music.youtube.com/channel/${UC}`,
      'artist',
      UC,
      `https://music.youtube.com/channel/${UC}`,
    ],
    [
      `https://www.youtube.com/playlist?list=${LIST}&si=x`,
      'playlist',
      LIST,
      `https://www.youtube.com/playlist?list=${LIST}`,
    ],
    [
      `https://www.youtube.com/watch?v=90Kgw_SvK4w&list=${LIST}&index=3`,
      'playlist',
      LIST,
      `https://www.youtube.com/playlist?list=${LIST}`,
    ],
    [
      `https://youtu.be/90Kgw_SvK4w?list=${LIST}`,
      'playlist',
      LIST,
      `https://www.youtube.com/playlist?list=${LIST}`,
    ],
    [
      `https://music.youtube.com/playlist?list=OLAK5uy_abcdefghijk`,
      'playlist',
      'OLAK5uy_abcdefghijk',
      'https://music.youtube.com/playlist?list=OLAK5uy_abcdefghijk',
    ],
    [
      'https://www.youtube.com/watch?v=90Kgw_SvK4w&t=42s',
      'video',
      '90Kgw_SvK4w',
      'https://www.youtube.com/watch?v=90Kgw_SvK4w',
    ],
    [
      'https://youtu.be/90Kgw_SvK4w?si=tracking',
      'video',
      '90Kgw_SvK4w',
      'https://www.youtube.com/watch?v=90Kgw_SvK4w',
    ],
    [
      'https://www.youtube.com/shorts/90Kgw_SvK4w',
      'video',
      '90Kgw_SvK4w',
      'https://www.youtube.com/watch?v=90Kgw_SvK4w',
    ],
    [
      'https://www.youtube.com/watch?v=90Kgw_SvK4w&list=RD90Kgw_SvK4w',
      'video',
      '90Kgw_SvK4w',
      'https://www.youtube.com/watch?v=90Kgw_SvK4w',
    ],
    [
      'https://music.youtube.com/watch?v=90Kgw_SvK4w',
      'video',
      '90Kgw_SvK4w',
      'https://music.youtube.com/watch?v=90Kgw_SvK4w',
    ],
    [
      'https://music.youtube.com/playlist?list=RDCLAK5uy_curated123',
      'playlist',
      'RDCLAK5uy_curated123',
      'https://music.youtube.com/playlist?list=RDCLAK5uy_curated123',
    ],
  ])('%s → %s %s', (input, kind, id, url) => {
    expect(parseYoutubeUrl(input)).toMatchObject({ kind, id, url });
  });

  it.each([
    '',
    '   ',
    'not a url',
    'NASA',
    'https://vimeo.com/12345',
    'https://notyoutube.com/@NASA',
    'https://youtube.com.evil.example/@NASA',
    'ftp://www.youtube.com/@NASA',
    'javascript:alert(1)',
    'https://www.youtube.com/',
    'https://www.youtube.com/feed/trending',
    'https://www.youtube.com/results?search_query=nasa',
    'https://www.youtube.com/channel/not-a-channel-id',
    'https://www.youtube.com/playlist',
    'https://www.youtube.com/playlist?list=RDMMabcdefghijk',
    'https://www.youtube.com/playlist?list=WL',
    'https://www.youtube.com/playlist?list=LL',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch',
    'https://youtu.be/',
    'https://music.youtube.com/c/NASA',
    'https://music.youtube.com/browse/MPREb_abc',
    'https://www.youtube.com/@',
    'https://www.youtube.com/@NASA with spaces',
  ])('rejects %j', (input) => {
    expect(parseYoutubeUrl(input)).toBeNull();
  });

  it('marks YouTube Music links and guesses the library', () => {
    const music = parseYoutubeUrl(`https://music.youtube.com/channel/${UC}`)!;
    const video = parseYoutubeUrl('https://www.youtube.com/@NASA')!;
    expect(music.music).toBe(true);
    expect(guessLibrary(music)).toBe('music');
    expect(video.music).toBe(false);
    expect(guessLibrary(video)).toBe('video');
  });
});

describe('uploadsPerWeek', () => {
  const day = 86_400_000;
  const t0 = Date.UTC(2026, 8, 1);

  it('is null with fewer than two dated items', () => {
    expect(uploadsPerWeek([])).toBeNull();
    expect(uploadsPerWeek([t0])).toBeNull();
    expect(uploadsPerWeek([t0, Number.NaN])).toBeNull();
  });

  it('counts intervals over the span, in any order', () => {
    // One upload a day for a week: 7 intervals over 7 days.
    const daily = Array.from({ length: 8 }, (_, i) => t0 + i * day);
    expect(uploadsPerWeek(daily.toReversed())).toBe(7);
    // Three uploads a week: 3 intervals over 7 days (Mon, Wed, Fri, next Mon).
    expect(uploadsPerWeek([t0, t0 + 2 * day, t0 + 4 * day, t0 + 7 * day])).toBe(3);
    // Two uploads a month apart.
    expect(uploadsPerWeek([t0, t0 + 30 * day])).toBe(0.2);
  });

  it('treats items on the same day as a one-day span', () => {
    expect(uploadsPerWeek([t0, t0, t0])).toBe(14);
  });
});

describe('source inputs', () => {
  it('SourceOptionsInput keeps only the given fields (no defaults)', () => {
    expect(SourceOptionsInput.parse({ syncOrder: true })).toEqual({ syncOrder: true });
    expect(SourceOptionsInput.safeParse({ skipShorts: true }).success).toBe(false);
  });

  it('CreateSource and UpdateSource take a matcher and options', () => {
    expect(
      CreateSource.safeParse({
        url: '@NASA',
        library: 'video',
        matcher: DEFAULT_VIDEO_MATCHER,
        options: { syncOrder: false },
      }).success,
    ).toBe(true);
    expect(UpdateSource.safeParse({ matcher: { type: 'and', items: [] } }).success).toBe(true);
    expect(UpdateSource.safeParse({ matcher: { type: 'bogus' } }).success).toBe(false);
    expect(UpdateSource.safeParse({ rules: { library: 'video' } }).success).toBe(false);
    expect(RulesPreviewRequest.safeParse({ matcher: DEFAULT_VIDEO_MATCHER }).success).toBe(true);
    expect(RulesPreviewRequest.safeParse({}).success).toBe(false);
  });

  it('CreateSource requires url and library', () => {
    expect(CreateSource.safeParse({ url: '@NASA', library: 'video' }).success).toBe(true);
    expect(CreateSource.safeParse({ url: '@NASA' }).success).toBe(false);
    expect(CreateSource.safeParse({ url: '@NASA', library: 'podcasts' }).success).toBe(false);
  });

  it('UpdateSource rejects an empty patch', () => {
    expect(UpdateSource.safeParse({}).success).toBe(false);
    expect(UpdateSource.safeParse({ subscribed: false }).success).toBe(true);
    expect(UpdateSource.safeParse({ name: '  ' }).success).toBe(false);
  });
});
