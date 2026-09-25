/**
 * The yt-dlp metadata provider: tags and cover art embedded by yt-dlp itself while it
 * downloads a track. It is the first provider of the music metadata chain (architecture skill,
 * settled decisions) and the only one that is always on; later providers (MusicBrainz, Discogs)
 * enrich the tags after the download. The chain wraps `ytdlpTagArgs`: it may pass better values
 * in `TrackTags` before the download, or rewrite the file's tags afterwards.
 */

/** The tags written into a track file. Null or empty values are left to yt-dlp's own. */
export interface TrackTags {
  title: string | null;
  artist: string | null;
  album: string | null;
  /** The album's artist (the artist source), when it differs from the track artist or not. */
  albumArtist: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  year: number | null;
}

export interface TagOptions {
  /** The source option "Embed cover art and tags" (`SourceOptions.embedCoverArt`). */
  embedCoverArt: boolean;
}

/**
 * The cover is cropped to the centre square: YouTube thumbnails are 16:9, with the square album
 * art in the middle for YouTube Music tracks. Converting to png makes sure the converter (and
 * so the crop) always runs: YouTube never serves png, while a jpg would be passed through as is.
 */
const SQUARE_CROP = `-vf crop="'if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'"`;

/** `TrackTags` field → the ffmpeg tag yt-dlp's `meta_<tag>` field overrides. */
const TAG_FIELDS: readonly (readonly [keyof TrackTags, string])[] = [
  ['title', 'title'],
  ['artist', 'artist'],
  ['album', 'album'],
  ['albumArtist', 'album_artist'],
  ['trackNumber', 'track'],
  ['discNumber', 'disc'],
  ['year', 'date'],
];

/**
 * yt-dlp flags that embed the cover and the tags into a downloaded track, or nothing when the
 * source's "Embed cover art and tags" option is off.
 *
 * - `--embed-metadata` writes yt-dlp's own fields; `--embed-thumbnail` embeds the cover (as a
 *   square png, see `SQUARE_CROP`); no thumbnail file stays next to the track.
 * - One `--parse-metadata` per known value sets yt-dlp's `meta_<tag>` field, which overrides the
 *   tag it would write: our title, artist, album, album artist, track number (the album
 *   position, which a flat listing knows and yt-dlp does not), disc and year.
 */
export function ytdlpTagArgs(tags: TrackTags, options: TagOptions): string[] {
  if (!options.embedCoverArt) return [];
  const args = [
    '--embed-metadata',
    '--embed-thumbnail',
    '--convert-thumbnails',
    'png',
    '--postprocessor-args',
    `ThumbnailsConvertor+ffmpeg_o:${SQUARE_CROP}`,
  ];
  for (const [field, tag] of TAG_FIELDS) {
    const value = tags[field];
    if (value === null || value === '') continue;
    args.push('--parse-metadata', setMetadata(tag, String(value)));
  }
  return args;
}

/**
 * A `--parse-metadata` action that sets `meta_<tag>` to a literal value. The FROM side is an
 * output template: `%` is doubled and `:` escaped (yt-dlp splits FROM:TO at the first unescaped
 * colon and unescapes `\:`). The value is wrapped in `#` so FROM is never a bare field name and
 * never ends in a backslash; the TO side is a regex that strips them again. The `pre_process:`
 * prefix names the stage, so a value can never be read as one.
 */
export function setMetadata(tag: string, value: string): string {
  const from = `#${value.replaceAll('%', '%%').replaceAll(':', '\\:')}#`;
  return `pre_process:${from}:(?s)^#(?P<meta_${tag}>.*)#$`;
}
