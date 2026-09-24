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
 * - Single video: `_type: video` with full metadata and no entries.
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
  playlist_count: num,
  thumbnails,
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
  /** True when the URL is a `/shorts/` URL or the entry came from the Shorts tab. */
  isShort: boolean;
  /** The channel tab the entry was listed under, when the source was a channel root. */
  tab: ChannelTab | null;
  thumbnails: Thumbnail[];
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
    isShort: !isPlaylist && (url.includes('/shorts/') || tab === 'shorts'),
    tab,
    thumbnails: node.thumbnails,
  };
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
