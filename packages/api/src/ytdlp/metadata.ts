// yt-dlp's JSON names the node type `_type`.
/* oxlint-disable no-underscore-dangle */
import { z } from 'zod';

/**
 * Schemas for the subset of yt-dlp's `--dump-single-json --flat-playlist` output that
 * MyTube uses, and the normalisation into `SourceMetadata`. Unknown fields are ignored
 * and every field is optional or nullable, because yt-dlp omits or nulls fields freely
 * depending on the extractor and the page.
 *
 * Shapes seen in practice (fixtures in `test/fixtures/ytdlp`):
 * - Channel root (`/@handle`): `_type: playlist`, `extractor: youtube:tab`, entries are the
 *   channel's tabs (Videos, Live, Shorts), each a nested playlist with its own entries.
 * - Channel tab (`/@handle/videos`) and playlist (`/playlist?list=`): `_type: playlist` with
 *   flat `_type: url` entries.
 * - Single video: `_type: video` with full metadata and no entries. It also names the streams
 *   yt-dlp's format selection picked (`-f`, see `MetadataArgs.format`, else its default):
 *   `requested_formats` (video and audio, each with `format_id` and `filesize`,
 *   `filesize_approx` or at least `tbr`) for a merged download, or the same fields at the top
 *   level for a single file. HLS formats often have no size at all, only a bitrate.
 */

const str = z.string().nullish().catch(null);
const num = z.number().nullish().catch(null);

export const LiveStatus = z.enum(['not_live', 'is_live', 'is_upcoming', 'was_live', 'post_live']);
export type LiveStatus = z.infer<typeof LiveStatus>;

export const Thumbnail = z.object({
  url: z.string(),
  width: num,
  height: num,
  id: str,
});
export type Thumbnail = z.infer<typeof Thumbnail>;

const thumbnails = z
  .array(z.unknown())
  .nullish()
  .catch(null)
  .transform((list) =>
    (list ?? []).flatMap((item) => {
      const parsed = Thumbnail.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

/** One node of yt-dlp's info JSON: the source itself, a tab, or an entry. */
export const RawInfo = z.object({
  _type: str,
  id: z.string(),
  title: str,
  url: str,
  webpage_url: str,
  original_url: str,
  extractor: str,
  extractor_key: str,
  ie_key: str,
  channel: str,
  channel_id: str,
  channel_url: str,
  uploader: str,
  uploader_id: str,
  uploader_url: str,
  duration: num,
  upload_date: str,
  timestamp: num,
  release_timestamp: num,
  live_status: LiveStatus.nullish().catch(null),
  /**
   * `public`, `unlisted`, `subscriber_only` (members only), `premium_only`, `needs_auth`,
   * `private`. Flat listings set it from the entry's badge only (members only), else null.
   */
  availability: str,
  playlist_count: num,
  // YouTube Music fields (a track's full metadata; flat listings leave them out).
  track: str,
  artist: str,
  artists: z.array(z.string()).nullish().catch(null),
  album: str,
  album_artist: str,
  release_year: num,
  release_date: str,
  track_number: num,
  disc_number: num,
  thumbnails,
  // Sizes of what a download would fetch: the selected streams of a merged download, or the
  // single file. Present for a single video only (flat entries carry no formats).
  format_id: str,
  filesize: num,
  filesize_approx: num,
  /** Total bitrate in kbit/s. */
  tbr: num,
  requested_formats: z.array(z.unknown()).nullish().catch(null),
  // Subtitle tracks by language: uploaded ones, and YouTube's automatic captions (the spoken
  // language plus a machine translation into every other language). Single videos only.
  subtitles: z.record(z.string(), z.array(z.unknown())).nullish().catch(null),
  automatic_captions: z.record(z.string(), z.array(z.unknown())).nullish().catch(null),
  // Entries are validated one by one in `toSourceMetadata`, so one odd entry does not
  // reject the whole listing.
  entries: z.array(z.unknown()).nullish().catch(null),
});
export type RawInfo = z.infer<typeof RawInfo>;

export type SourceKind = 'channel' | 'playlist' | 'video';
const CHANNEL_TABS = ['videos', 'shorts', 'streams', 'releases', 'podcasts', 'playlists'] as const;
export type ChannelTab = (typeof CHANNEL_TABS)[number];

export interface SourceEntry {
  /** `video` for a single upload; `playlist` for a nested list such as an album. */
  kind: 'video' | 'playlist';
  id: string;
  title: string | null;
  url: string;
  /** Seconds, or null when unknown (live streams, shorts in flat listings). */
  duration: number | null;
  /** `YYYY-MM-DD` (UTC), from `upload_date` or else `timestamp`. */
  uploadDate: string | null;
  /** Unix seconds. In flat channel listings this is yt-dlp's approximate date (a day). */
  timestamp: number | null;
  liveStatus: LiveStatus | null;
  /**
   * yt-dlp's `availability`. Flat listings only fill it for badged entries (`subscriber_only`
   * for members-only videos) and leave it null otherwise; a single video's metadata always
   * has it (`public`, `unlisted`, ...).
   */
  availability: string | null;
  /** True when the URL is a `/shorts/` URL or the entry came from the Shorts tab. */
  isShort: boolean;
  /** The channel tab the entry was listed under, when the source was a channel root. */
  tab: ChannelTab | null;
  /**
   * The uploading channel when the listing says so (playlist entries, single videos). Flat
   * channel listings leave it out: the entries belong to the listed channel.
   */
  channelId: string | null;
  channel: string | null;
  thumbnails: Thumbnail[];
  /**
   * The streams a download of this entry fetches, in download order (video, then audio), with
   * their expected sizes. Empty for flat listing entries, which carry no formats.
   */
  expectedStreams: ExpectedStream[];
  /**
   * Bytes a download of this entry fetches: the sum of `expectedStreams`. Null when any
   * stream's size is unknown, and for flat listing entries.
   */
  expectedBytes: number | null;
  /**
   * The subtitle languages a single video's full metadata offers; null in flat listings, which
   * carry none.
   */
  captions?: CaptionLanguages | null;
  /**
   * YouTube Music tags from a track's full metadata (the watch page of a track); null in flat
   * listings. `artist` is yt-dlp's `artist`, else its `artists` joined with `, `.
   */
  music?: MusicTags;
}

/** A video's subtitle languages, as yt-dlp's `subtitles` and `automatic_captions` keys. */
export interface CaptionLanguages {
  /** Subtitles the uploader provided. */
  uploaded: string[];
  /**
   * YouTube's automatic captions in the spoken language (also as `<lang>-orig`), without the
   * machine translations into other languages that yt-dlp lists next to them.
   */
  generated: string[];
}

/** One stream yt-dlp selected for download. */
export interface ExpectedStream {
  formatId: string | null;
  /** Exact size, else yt-dlp's estimate, else bitrate × duration; null when none is known. */
  bytes: number | null;
}

/** What yt-dlp's YouTube Music extraction says about a track. Every field may be null. */
export interface MusicTags {
  track: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  releaseYear: number | null;
  /** `YYYY-MM-DD`. */
  releaseDate: string | null;
  trackNumber: number | null;
  discNumber: number | null;
}

export interface SourceMetadata {
  kind: SourceKind;
  /** Channel id (`UC…`) for channels, playlist id, or video id. */
  id: string;
  /** Channel name for channels, else the playlist or video title. */
  title: string;
  url: string;
  channel: string | null;
  channelId: string | null;
  /** Canonical `/channel/UC…` URL. */
  channelUrl: string | null;
  /** Handle URL (`/@name`) when YouTube has one. */
  uploaderUrl: string | null;
  /** The channel avatar for channels, else the largest thumbnail. */
  thumbnailUrl: string | null;
  thumbnails: Thumbnail[];
  /** Total entries YouTube reports, which may exceed `entries.length` when `limit` is set. */
  playlistCount: number | null;
  /**
   * Flattened entries, in listing order, without duplicates. Channel tabs are merged
   * (each entry keeps its `tab`). A single video is its own only entry.
   */
  entries: SourceEntry[];
  /** Entries that failed validation and were dropped. */
  skippedEntries: number;
}

const CHANNEL_URL = /youtube\.com\/(@|channel\/|c\/|user\/)/;

export function detectKind(info: RawInfo): SourceKind {
  if (info._type === 'video' || (!info._type && !info.entries)) return 'video';
  const pageUrl = info.webpage_url ?? info.original_url ?? '';
  if (pageUrl.includes('list=')) return 'playlist';
  if (
    info.id.startsWith('@') ||
    (info.channel_id !== null && info.channel_id === info.id) ||
    CHANNEL_URL.test(pageUrl)
  ) {
    return 'channel';
  }
  return 'playlist';
}

/** Parses the raw JSON yt-dlp printed and normalises it. Throws a ZodError if unusable. */
export function parseSourceMetadata(json: unknown, requestedUrl?: string): SourceMetadata {
  return toSourceMetadata(RawInfo.parse(json), requestedUrl);
}

export function toSourceMetadata(info: RawInfo, requestedUrl?: string): SourceMetadata {
  const kind = detectKind(info);
  const entries: SourceEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  const add = (entry: SourceEntry) => {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  const walk = (list: readonly unknown[], tab: ChannelTab | null) => {
    for (const item of list) {
      const parsed = RawInfo.safeParse(item);
      if (!parsed.success) {
        skipped++;
        continue;
      }
      const node = parsed.data;
      if (node._type === 'playlist' && node.entries) {
        // A channel tab (or another nested listing): descend.
        walk(node.entries, tabOf(node) ?? tab);
      } else {
        add(toEntry(node, tab));
      }
    }
  };

  if (kind === 'video') add(toEntry(info, null));
  else walk(info.entries ?? [], tabOf(info));

  const channelName = info.channel ?? info.uploader ?? null;
  return {
    kind,
    id: kind === 'channel' ? (info.channel_id ?? info.id) : info.id,
    title: (kind === 'channel' ? channelName : null) ?? info.title ?? info.id,
    url: info.webpage_url ?? info.original_url ?? requestedUrl ?? info.url ?? '',
    channel: channelName,
    channelId: info.channel_id ?? null,
    channelUrl: info.channel_url ?? null,
    uploaderUrl: info.uploader_url ?? null,
    thumbnailUrl: pickThumbnail(info.thumbnails, kind === 'channel'),
    thumbnails: info.thumbnails,
    playlistCount: info.playlist_count ?? null,
    entries,
    skippedEntries: skipped,
  };
}

function tabOf(node: RawInfo): ChannelTab | null {
  const last = (node.webpage_url ?? '').replace(/\/+$/, '').split('/').pop();
  return CHANNEL_TABS.find((tab) => tab === last) ?? null;
}

function toEntry(node: RawInfo, tab: ChannelTab | null): SourceEntry {
  const url = node.url ?? node.webpage_url ?? `https://www.youtube.com/watch?v=${node.id}`;
  const isPlaylist =
    node._type === 'playlist' ||
    node.ie_key === 'YoutubeTab' ||
    (node._type === 'url' && url.includes('list=') && !url.includes('watch?'));
  return {
    kind: isPlaylist ? 'playlist' : 'video',
    id: node.id,
    title: node.title ?? null,
    url,
    duration: node.duration ?? null,
    uploadDate: formatDate(node.upload_date, node.timestamp ?? node.release_timestamp),
    timestamp: node.timestamp ?? node.release_timestamp ?? null,
    liveStatus: node.live_status ?? null,
    availability: node.availability ?? null,
    isShort: !isPlaylist && (url.includes('/shorts/') || tab === 'shorts'),
    tab,
    channelId: node.channel_id ?? null,
    channel: node.channel ?? node.uploader ?? null,
    thumbnails: node.thumbnails,
    ...expected(node),
    captions: captionLanguages(node),
    music: musicTags(node),
  };
}

const CaptionTrack = z.object({ url: z.string() });

/**
 * The subtitle languages of a single video's metadata, or null when it lists none (flat
 * listings). A machine translation of the automatic captions is fetched from the original
 * track's URL with a `tlang` (target language) parameter; the spoken language has a track
 * without one, so that is what counts as generated. (yt-dlp's `youtube:skip=translated_subs`
 * only drops translations of uploaded subtitles, not these.) `live_chat` is not a subtitle.
 */
export function captionLanguages(node: RawInfo): CaptionLanguages | null {
  if (!node.subtitles && !node.automatic_captions) return null;
  const uploaded = Object.keys(node.subtitles ?? {}).filter((lang) => lang !== 'live_chat');
  const generated = Object.entries(node.automatic_captions ?? {})
    .filter(([, tracks]) => tracks.some(isUntranslatedTrack))
    .map(([lang]) => lang);
  return { uploaded, generated };
}

function isUntranslatedTrack(track: unknown): boolean {
  const parsed = CaptionTrack.safeParse(track);
  if (!parsed.success) return false;
  try {
    return !new URL(parsed.data.url, 'https://www.youtube.com').searchParams.has('tlang');
  } catch {
    return false;
  }
}

/** A positive whole number, else null (yt-dlp sometimes reports 0 or floats). */
function whole(value: number | null | undefined): number | null {
  return value != null && Number.isInteger(value) && value > 0 ? value : null;
}

function musicTags(node: RawInfo): MusicTags {
  return {
    track: node.track ?? null,
    artist: node.artist ?? (node.artists?.length ? node.artists.join(', ') : null),
    album: node.album ?? null,
    albumArtist: node.album_artist ?? null,
    releaseYear: whole(node.release_year),
    releaseDate: formatDate(node.release_date, null),
    trackNumber: whole(node.track_number),
    discNumber: whole(node.disc_number),
  };
}

const FormatSize = z.object({ format_id: str, filesize: num, filesize_approx: num, tbr: num });
type FormatSize = z.infer<typeof FormatSize>;

/**
 * What a download of `node` fetches: each of `requested_formats` (separate video and audio
 * streams), else the single file when yt-dlp selected one. `expectedBytes` sums them; one
 * stream of unknown size makes the sum unknown.
 */
export function expected(node: RawInfo): Pick<SourceEntry, 'expectedStreams' | 'expectedBytes'> {
  const formats = node.requested_formats?.length
    ? node.requested_formats.map((item) => {
        const parsed = FormatSize.safeParse(item);
        return parsed.success ? parsed.data : { format_id: null };
      })
    : node.format_id || node.filesize || node.filesize_approx
      ? [node]
      : [];
  const expectedStreams = formats.map((format) => ({
    formatId: format.format_id ?? null,
    bytes: sizeOf(format, node.duration),
  }));
  const sizes = expectedStreams.map((stream) => stream.bytes);
  const expectedBytes =
    sizes.length > 0 && sizes.every((bytes) => bytes !== null)
      ? sizes.reduce((sum, bytes) => sum + bytes, 0)
      : null;
  return { expectedStreams, expectedBytes };
}

/**
 * Exact size, else yt-dlp's estimate, else bitrate × duration (yt-dlp's own estimate, which
 * it leaves out for HLS formats; there the bitrate is the playlist's, so it runs high).
 */
function sizeOf(format: Partial<FormatSize>, duration: number | null | undefined) {
  const bitrateBytes = format.tbr && duration ? (format.tbr * 1000 * duration) / 8 : null;
  const bytes = format.filesize ?? format.filesize_approx ?? bitrateBytes;
  return bytes != null && Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : null;
}

function formatDate(uploadDate: string | null | undefined, timestamp: number | null | undefined) {
  if (uploadDate && /^\d{8}$/.test(uploadDate)) {
    return `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}`;
  }
  if (timestamp != null) return new Date(timestamp * 1000).toISOString().slice(0, 10);
  return null;
}

function pickThumbnail(list: readonly Thumbnail[], preferAvatar: boolean): string | null {
  if (list.length === 0) return null;
  if (preferAvatar) {
    const avatar = list.find((t) => t.id === 'avatar_uncropped');
    if (avatar) return avatar.url;
    const square = largest(list.filter((t) => t.width && t.width === t.height));
    if (square) return square.url;
  }
  return (largest(list) ?? list[list.length - 1]!).url;
}

function largest(list: readonly Thumbnail[]): Thumbnail | undefined {
  let best: Thumbnail | undefined;
  for (const t of list) {
    if (!t.width || !t.height) continue;
    if (!best || t.width * t.height > best.width! * best.height!) best = t;
  }
  return best;
}
