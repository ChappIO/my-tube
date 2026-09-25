import { describe, expect, it } from 'vitest';
import { countFormats, LISTING_MAX_LINES, listingLogLines } from './formats.js';

// `yt-dlp -F` output shapes (2026.08.19, --color never).
const TABLE = [
  '$ yt-dlp --ignore-config --color never -F --no-playlist -- https://music.youtube.com/watch?v=x',
  '[youtube] Extracting URL: https://music.youtube.com/watch?v=x',
  'WARNING: [youtube] x: Some web client https formats have been skipped as they are missing a url.',
  '[info] Available formats for x:',
  'ID  EXT   RESOLUTION FPS CH │   FILESIZE   TBR PROTO │ VCODEC  VBR ACODEC   ABR MORE INFO',
  '─'.repeat(90),
  'sb0 mhtml 48x27        0    │                  mhtml │ images               storyboard',
  '140 m4a   audio only      2 │    3.16MiB  129k https │ audio only  mp4a.40.2 129k medium',
  '251 webm  audio only      2 │    3.30MiB  135k https │ audio only  opus      135k medium',
  'exit 0',
];

describe('countFormats', () => {
  it('counts media formats and storyboards in the table', () => {
    expect(countFormats(TABLE)).toEqual({ mediaFormats: 2, storyboards: 1 });
  });

  it('reads a storyboards-only table as no media format', () => {
    const lines = TABLE.filter((line) => !/^(140|251) /.test(line));
    expect(countFormats(lines)).toEqual({ mediaFormats: 0, storyboards: 1 });
  });

  it('reads "No video formats found" as none at all', () => {
    expect(
      countFormats([
        'ERROR: [youtube] x: No video formats found!; please report this issue on  https://…',
        'exit 1',
      ]),
    ).toEqual({ mediaFormats: 0, storyboards: 0 });
  });

  it('knows nothing when the listing failed otherwise', () => {
    expect(
      countFormats(['ERROR: [youtube] x: Sign in to confirm you’re not a bot.', 'exit 1']),
    ).toEqual({ mediaFormats: null, storyboards: 0 });
  });
});

describe('listingLogLines', () => {
  it('frames the listing and caps it', () => {
    const lines = Array.from({ length: LISTING_MAX_LINES + 5 }, (_, i) => `line ${i}`);
    const out = listingLogLines({ lines, mediaFormats: 3, storyboards: 0, withCookies: false });
    expect(out[0]).toBe('--- formats (diagnostic) ---');
    expect(out).toHaveLength(LISTING_MAX_LINES + 3);
    expect(out.at(-2)).toBe('… (5 more lines)');
    expect(out.at(-1)).toBe(
      '--- end of formats (diagnostic): 3 downloadable formats, without cookies ---',
    );
  });
});
