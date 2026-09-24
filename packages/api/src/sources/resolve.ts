import {
  Rules,
  defaultRules,
  uploadsPerWeek,
  type Library,
  type RulesInput,
  type Settings,
  type SourceKind,
} from '@mytube/shared';
import type { SourceEntry, SourceMetadata } from '../ytdlp/metadata.js';

/*
 * Pure helpers behind resolve and create, unit-tested without yt-dlp or a database.
 */

/** How many of the newest items the upload cadence is computed from. */
export const CADENCE_ITEMS = 30;

/**
 * The kind a source gets in a library. Channels and artists are the same thing on YouTube
 * (a channel id); an artist is how the Music library calls it. A playlist stays a playlist.
 */
export function kindForLibrary(kind: SourceKind, library: Library): SourceKind {
  if (kind === 'playlist') return kind;
  return library === 'music' ? 'artist' : 'channel';
}

/**
 * The URL stored on a source: id-based, so a renamed handle does not break it. Artists use
 * YouTube Music; playlists keep the host they were pasted from.
 */
export function canonicalSourceUrl(kind: SourceKind, youtubeId: string, music: boolean): string {
  const id = encodeURIComponent(youtubeId);
  if (kind === 'playlist') {
    return `https://${music ? 'music' : 'www'}.youtube.com/playlist?list=${id}`;
  }
  if (!youtubeId.startsWith('UC')) {
    // No channel id in the metadata; fall back to the handle or legacy path yt-dlp gave us.
    return new URL(youtubeId, 'https://www.youtube.com/').href;
  }
  return `https://${kind === 'artist' ? 'music' : 'www'}.youtube.com/channel/${id}`;
}

/** Avatar size requested from YouTube's image server: 2× the 88px channel page avatar. */
export const AVATAR_SIZE = 256;

/**
 * An absolute image URL, or null. YouTube sometimes returns protocol-relative URLs, and its
 * uncropped avatars end in `=s0` (the original upload, often several megabytes), which is
 * swapped for `=s256`.
 */
export function imageUrl(url: string | null): string | null {
  if (!url) return null;
  const absolute = url.startsWith('//') ? `https:${url}` : url;
  try {
    const parsed = new URL(absolute);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.href.replace(/=s0$/, `=s${AVATAR_SIZE}`);
  } catch {
    return null;
  }
}

/** Publish time of an entry in ms, or null when yt-dlp gave no date. */
export function entryTime(entry: SourceEntry): number | null {
  if (entry.timestamp !== null) return entry.timestamp * 1000;
  if (entry.uploadDate !== null) {
    const time = Date.parse(`${entry.uploadDate}T00:00:00Z`);
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

/**
 * Upload cadence and the newest publish time from a listing. Uses the newest
 * `CADENCE_ITEMS` dated uploads across the channel tabs (videos, streams, shorts), skipping
 * nested playlists and streams that have not happened yet.
 */
export function cadence(metadata: Pick<SourceMetadata, 'entries'>): {
  uploadsPerWeek: number | null;
  latestItemAt: string | null;
} {
  const times = metadata.entries
    .filter((entry) => entry.kind === 'video' && entry.liveStatus !== 'is_upcoming')
    .map(entryTime)
    .filter((time): time is number => time !== null)
    .toSorted((a, b) => b - a)
    .slice(0, CADENCE_ITEMS);
  return {
    uploadsPerWeek: uploadsPerWeek(times),
    latestItemAt: times.length > 0 ? new Date(times[0]!).toISOString() : null,
  };
}

/**
 * The rules a new source starts with: the library defaults, for video sources overlaid with
 * Settings → Video (`keepDays`, `skipShorts`), then overlaid with what the client sent. The
 * caller checks `input.library` against the source's library first.
 */
export function initialRules(
  library: Library,
  settings: Pick<Settings, 'video'>,
  input?: RulesInput,
): Rules {
  const base = defaultRules(library);
  const withSettings =
    base.library === 'video'
      ? { ...base, keepDays: settings.video.keepDays, skipShorts: settings.video.skipShorts }
      : base;
  return Rules.parse({ ...withSettings, ...input });
}

/** The current rules with the client's changes on top. */
export function mergeRules(current: Rules, input: RulesInput): Rules {
  return Rules.parse({ ...current, ...input });
}
