import type {
  AlbumListItem,
  ArtistListItem,
  Job,
  LibrarySummary,
  PlaylistListItem,
} from '@mytube/shared';

/*
 * Display formatting shared by the screens: relative times, sizes, counts, upload cadence, and
 * the Activity queue and history (speeds, row meta and state, day labels, result colours).
 * Pure functions; `now` is a parameter so tests and `useNow` control the clock.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * How long ago an ISO timestamp was, in the handoff's style: `just now`, `12 min ago`,
 * `1 h ago`, `2 days ago`, `3 weeks ago`, `4 months ago`, `2 years ago`. Times in the future
 * (clock skew) and unparsable ones read `just now`.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const elapsed = now - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  const days = Math.floor(elapsed / DAY);
  if (days < 14) return `${plural(days, 'day')} ago`;
  if (days < 60) return `${plural(Math.floor(days / 7), 'week')} ago`;
  if (days < 365) return `${plural(Math.floor(days / 30), 'month')} ago`;
  return `${plural(Math.floor(days / 365), 'year')} ago`;
}

/** `checked 12 min ago`, or `never checked` before the first check. */
export function checkedAgo(iso: string | null, now: number = Date.now()): string {
  return iso === null ? 'never checked' : `checked ${relativeTime(iso, now)}`;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * Size in decimal units, as disks and the handoff write them: `0 B`, `512 KB`, `1.2 GB`,
 * `38 GB`. One decimal below 10 of a unit, whole numbers above.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  // 999.6 KB rounds to 1000 KB; carry into the next unit instead.
  if (rounded >= 1000 && unit < BYTE_UNITS.length - 1) return `1 ${BYTE_UNITS[unit + 1]}`;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

/** A count with thousands separators: `1,204`. */
export function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

/** `3 videos`, `1 video`, `1,204 tracks`. */
export function countOf(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/**
 * Upload cadence for the Add modal's source card: `3.2 uploads/week`, `1.0 upload/week`, and
 * `0 uploads/week` when unknown (fewer than two dated uploads).
 */
export function formatCadence(uploadsPerWeek: number | null): string {
  if (uploadsPerWeek === null || uploadsPerWeek <= 0) return '0 uploads/week';
  const value = uploadsPerWeek.toFixed(1);
  return `${value} ${value === '1.0' ? 'upload' : 'uploads'}/week`;
}

// Activity screen.

/** `4.1 MB/s`. */
export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * The queue row's meta line, as in the handoff (`Deep Dive Podcast · 1080p · 1.2 GB · 4.1 MB/s`):
 * channel, quality, size and speed, each only when known. The speed shows while running.
 */
export function queueMeta(job: Job): string {
  const parts: string[] = [];
  if (job.subtitle) parts.push(job.subtitle);
  if (job.detail) parts.push(job.detail);
  if (job.totalBytes) parts.push(formatBytes(job.totalBytes));
  if (job.status === 'running' && job.speedBytesPerSec)
    parts.push(formatSpeed(job.speedBytesPerSec));
  if (job.status === 'queued' && job.attempts > 0) {
    parts.push(`attempt ${job.attempts + 1} of ${job.maxAttempts}`);
  }
  return parts.join(' · ');
}

export type QueueTone = 'red' | 'muted';

// yt-dlp post-processors by the name its progress hook reports (the class name without the
// `FFmpeg` prefix and `PP` suffix; the prefixed spelling is accepted too).
const STAGE_LABELS: Record<string, string> = {
  Merger: 'merging',
  VideoRemuxer: 'remuxing',
  VideoConvertor: 'converting video',
  EmbedSubtitle: 'embedding subtitles',
  SubtitlesConvertor: 'converting subtitles',
  ThumbnailsConvertor: 'converting thumbnail',
  EmbedThumbnail: 'embedding thumbnail',
  MoveFiles: 'moving file',
  MoveFilesAfterDownload: 'moving file',
  Metadata: 'writing tags',
};

/** A post-processor stage as the queue says it: `Merger` → `merging`; unknown ones lowercased. */
export function stageLabel(stage: string): string {
  const key = stage.replace(/^FFmpeg/, '').replace(/PP$/, '');
  return STAGE_LABELS[key] ?? stage.toLowerCase();
}

/**
 * The state column: `downloading 64%` (red), `processing · merging` once the bytes are in,
 * `checking`, `queued` (muted), `failed` (red).
 */
export function queueState(job: Job): { text: string; tone: QueueTone } {
  if (job.status === 'failed') return { text: 'failed', tone: 'red' };
  if (job.status !== 'running') return { text: 'queued', tone: 'muted' };
  if (job.type === 'check_source') return { text: 'checking', tone: 'red' };
  if (job.stage) return { text: `processing · ${stageLabel(job.stage)}`, tone: 'red' };
  if (job.type !== 'download') return { text: 'running', tone: 'red' };
  if (job.progress === null) return { text: 'starting', tone: 'red' };
  return { text: `downloading ${Math.floor(job.progress * 100)}%`, tone: 'red' };
}

/** Width of the queue row's progress bar, 0 to 100 (floored like the state text). Failed and queued rows are empty. */
export function queuePercent(job: Job): number {
  return job.status === 'running' && job.progress !== null ? Math.floor(job.progress * 100) : 0;
}

/** The last line of an error, which is the useful one for yt-dlp (`ERROR: … unavailable`). */
export function errorTail(error: string | null): string | null {
  if (!error) return null;
  const lines = error.trim().split('\n');
  return lines.at(-1)?.trim() || null;
}

function localDay(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The history "when" column, grouped by local day like the handoff: `Today 08:12`,
 * `Yesterday 21:40`, `3 days ago` within a week, then the date (`2026-09-10`).
 */
export function whenLabel(at: string, now: Date = new Date()): string {
  const date = new Date(at);
  const days = localDay(now) - localDay(date);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (days <= 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7) return `${days} days ago`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type ResultTone = 'ok' | 'red' | 'muted';

/** History result colour: `done`, `updated`, `installed` green; `failed` red; the rest muted. */
export function resultTone(result: string): ResultTone {
  if (result === 'done' || result === 'updated' || result === 'installed') return 'ok';
  if (result === 'failed') return 'red';
  return 'muted';
}

// Library screens.

/** A video's length on its duration badge: `4:05`, `48:12`, `1:02:09`. */
export function formatLength(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = pad(total % 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${rest}` : `${minutes}:${rest}`;
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * A Home day group's label for a local date (`YYYY-MM-DD`): `Today`, `Yesterday`, the weekday
 * within the last week (`Monday`), then the date itself.
 */
export function dayLabel(day: string, now: Date = new Date()): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  const days = localDay(now) - Math.floor(Date.UTC(year, month - 1, date) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()]!;
  return day;
}

/**
 * When a video was published, for the tile chin: a date-only upload date (`2026-09-04`) counts
 * in whole local days (`today`, `yesterday`, `3 days ago`, then `relativeTime`'s weeks and
 * months); a full timestamp is `relativeTime`. Empty when unknown.
 */
export function publishedAgo(publishedAt: string | null, now: number = Date.now()): string {
  if (!publishedAt) return '';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(publishedAt);
  if (!dateOnly) return relativeTime(publishedAt, now);
  const days =
    localDay(new Date(now)) -
    Math.floor(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return relativeTime(new Date(now - days * DAY).toISOString(), now);
}

// Music tabs (handoff Screen 2).

/** A playlist's total length on its meta line: `2h51`, `4h12`, `42 min`. */
export function formatTotalLength(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${pad(minutes % 60)}`;
}

/** A tile meta line and whether it shows red (some tracks are not on disk). */
export interface MusicMeta {
  text: string;
  incomplete: boolean;
}

/** `10 tracks`, or `12/14 tracks` when fewer are on disk. */
function trackTally(trackCount: number, onDiskCount: number): string {
  return onDiskCount < trackCount
    ? `${formatCount(onDiskCount)}/${countOf(trackCount, 'track')}`
    : countOf(trackCount, 'track');
}

/**
 * An album tile's meta line: `2007 · 10 tracks` (`10 tracks` without a year) when every track is
 * on disk; `12/14 tracks` in red when some are not.
 */
export function albumMeta(
  album: Pick<AlbumListItem, 'year' | 'trackCount' | 'onDiskCount'>,
): MusicMeta {
  const incomplete = album.onDiskCount < album.trackCount;
  const tracks = trackTally(album.trackCount, album.onDiskCount);
  return {
    text: !incomplete && album.year !== null ? `${album.year} · ${tracks}` : tracks,
    incomplete,
  };
}

/** An artist tile's meta line: `9 albums · 112 tracks`. */
export function artistMeta(artist: Pick<ArtistListItem, 'albumCount' | 'trackCount'>): string {
  return `${countOf(artist.albumCount, 'album')} · ${countOf(artist.trackCount, 'track')}`;
}

/**
 * A playlist tile's meta line: `42 tracks · 2h51`; `65/68 tracks · 4h12` in red when some tracks
 * are not on disk.
 */
export function playlistMeta(
  playlist: Pick<PlaylistListItem, 'trackCount' | 'onDiskCount' | 'durationSeconds'>,
): MusicMeta {
  return {
    text: `${trackTally(playlist.trackCount, playlist.onDiskCount)} · ${formatTotalLength(playlist.durationSeconds)}`,
    incomplete: playlist.onDiskCount < playlist.trackCount,
  };
}

/**
 * The Music header sub line from `GET /api/library/summary`:
 * `31 artists · 84 albums · 3 playlists · 4 artist subscriptions`.
 */
export function musicLibrarySummary(summary: LibrarySummary['music']): string {
  return [
    countOf(summary.artists, 'artist'),
    countOf(summary.albums, 'album'),
    countOf(summary.playlists, 'playlist'),
    countOf(summary.artistSubscriptions, 'artist subscription'),
  ].join(' · ');
}
