import { describe, expect, it } from 'vitest';
import { setMetadata, ytdlpTagArgs, type TrackTags } from './ytdlp-tags.js';

const TAGS: TrackTags = {
  title: 'Heatwave',
  artist: 'Test Artist',
  album: 'First Light',
  albumArtist: 'Test Artist',
  trackNumber: 3,
  discNumber: null,
  year: 2024,
};

describe('ytdlpTagArgs (the yt-dlp metadata provider)', () => {
  it('embeds nothing when the source turns cover art and tags off', () => {
    expect(ytdlpTagArgs(TAGS, { embedCoverArt: false })).toEqual([]);
  });

  it('embeds the square cover and sets each known tag', () => {
    const args = ytdlpTagArgs({ ...TAGS, album: '' }, { embedCoverArt: true });
    expect(args.slice(0, 6)).toEqual([
      '--embed-metadata',
      '--embed-thumbnail',
      '--convert-thumbnails',
      'png',
      '--postprocessor-args',
      `ThumbnailsConvertor+ffmpeg_o:-vf crop="'if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'"`,
    ]);
    const tags = args.filter((_, index) => args[index - 1] === '--parse-metadata');
    // Empty and null values (album, disc) are left to yt-dlp.
    expect(tags.map((action) => /meta_(\w+)/.exec(action)?.[1])).toEqual([
      'title',
      'artist',
      'album_artist',
      'track',
      'date',
    ]);
  });

  it('escapes template and separator characters in literal values', () => {
    expect(setMetadata('title', '100% Live: Part 1')).toBe(
      'pre_process:#100%% Live\\: Part 1#:(?s)^#(?P<meta_title>.*)#$',
    );
    // A trailing backslash cannot escape the separator: the value is wrapped in #.
    expect(setMetadata('album', 'Back\\')).toBe('pre_process:#Back\\#:(?s)^#(?P<meta_album>.*)#$');
  });
});
