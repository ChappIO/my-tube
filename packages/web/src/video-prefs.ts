import type { SubtitleTrack } from '@mytube/shared';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';

/*
 * The video player's per-viewer settings (frontend skill "Player", "Video"): the captions
 * language, the subtitle size and background, the speed and theater mode. A tiny external store
 * like `player-state.ts`, kept in this browser's localStorage (`mytube.player.video`): they are
 * conveniences of one viewer, not library settings. Storage can be missing or refuse (a private
 * window); the defaults then hold for the session.
 */

export const SUBTITLE_SIZES = ['S', 'M', 'L'] as const;
export type SubtitleSize = (typeof SUBTITLE_SIZES)[number];

/** Speed cycles 1× → 1.25× → 1.5× → 2× → 0.75× → 1×. */
export const SPEEDS = [1, 1.25, 1.5, 2, 0.75] as const;

export const VIDEO_PREFS_KEY = 'mytube.player.video';

const Prefs = z.object({
  /** The captions language new videos start with; null is Off. */
  subLang: z.string().nullable().catch(null),
  subSize: z.enum(SUBTITLE_SIZES).catch('M'),
  subBg: z.boolean().catch(true),
  speed: z
    .number()
    .refine((value) => (SPEEDS as readonly number[]).includes(value))
    .catch(1),
  theater: z.boolean().catch(false),
});
export type VideoPrefs = z.infer<typeof Prefs>;

export const DEFAULT_VIDEO_PREFS: VideoPrefs = {
  subLang: null,
  subSize: 'M',
  subBg: true,
  speed: 1,
  theater: false,
};

/**
 * The track picked for one video in this session (the CC menu or C). It wins over `subLang` for
 * that video, so of two tracks in one language (a sidecar and an embedded one) either can be
 * chosen.
 */
export interface PickedTrack {
  videoId: number;
  /** The track's index in the video's list; -1 is Off. */
  index: number;
}

interface VideoPrefsState extends VideoPrefs {
  picked: PickedTrack | null;
}

/** The stored settings: every field that is missing or invalid falls back to its default. */
export function readVideoPrefs(raw: string | null | undefined): VideoPrefs {
  if (!raw) return DEFAULT_VIDEO_PREFS;
  try {
    const stored: unknown = JSON.parse(raw);
    const fields = typeof stored === 'object' && stored !== null ? stored : {};
    return Prefs.parse({ ...DEFAULT_VIDEO_PREFS, ...fields });
  } catch {
    return DEFAULT_VIDEO_PREFS;
  }
}

function load(): VideoPrefs {
  try {
    return readVideoPrefs(globalThis.localStorage?.getItem(VIDEO_PREFS_KEY));
  } catch {
    return DEFAULT_VIDEO_PREFS;
  }
}

function save(prefs: VideoPrefs): void {
  try {
    globalThis.localStorage?.setItem(VIDEO_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // No storage (a private window, blocked site data): the choice lasts for the session.
  }
}

let state: VideoPrefsState = { ...load(), picked: null };
const listeners = new Set<() => void>();

function set(patch: Partial<VideoPrefsState>): void {
  state = { ...state, ...patch };
  const { picked: _picked, ...prefs } = state;
  save(prefs);
  for (const listener of listeners) listener();
}

export function subscribeVideoPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function videoPrefs(): VideoPrefsState {
  return state;
}

export function useVideoPrefs(): VideoPrefsState {
  return useSyncExternalStore(subscribeVideoPrefs, videoPrefs, () => state);
}

/** The speed after `speed` in the cycle (an unknown one goes back to 1×). */
export function nextSpeed(speed: number): number {
  const index = (SPEEDS as readonly number[]).indexOf(speed);
  return SPEEDS[(index + 1) % SPEEDS.length] ?? 1;
}

/** `1×`, `1.25×`: the Speed pill. */
export function speedLabel(speed: number): string {
  return `${speed}×`;
}

/**
 * The index of the track that shows for a video, or -1 for Off: the track picked for this video,
 * else the first in the preferred language.
 */
export function activeTrackIndex(
  tracks: readonly SubtitleTrack[],
  videoId: number,
  prefs: Pick<VideoPrefsState, 'subLang' | 'picked'>,
): number {
  if (prefs.picked?.videoId === videoId && prefs.picked.index < tracks.length) {
    return prefs.picked.index;
  }
  if (prefs.subLang === null) return -1;
  return tracks.findIndex((track) => track.lang === prefs.subLang);
}

/** The next choice when cycling captions (C): Off → each track in order → Off. */
export function nextTrackIndex(tracks: readonly SubtitleTrack[], current: number): number {
  if (tracks.length === 0) return -1;
  return current + 1 >= tracks.length ? -1 : current + 1;
}

/** Shows a track of a video (or Off with -1) and makes its language the one new videos start with. */
export function pickTrack(tracks: readonly SubtitleTrack[], videoId: number, index: number): void {
  const track = tracks[index];
  set({ picked: { videoId, index: track ? index : -1 }, subLang: track ? track.lang : null });
}

/** C: the next captions choice for a video. */
export function cycleCaptions(tracks: readonly SubtitleTrack[], videoId: number): void {
  pickTrack(tracks, videoId, nextTrackIndex(tracks, activeTrackIndex(tracks, videoId, state)));
}

export function setSubSize(subSize: SubtitleSize): void {
  set({ subSize });
}

export function setSubBg(subBg: boolean): void {
  set({ subBg });
}

/** The Speed pill: one step through the cycle. */
export function cycleSpeed(): void {
  set({ speed: nextSpeed(state.speed) });
}

/** Theater / Fit (and T). */
export function toggleTheater(): void {
  set({ theater: !state.theater });
}

/**
 * A restored player session (`player-session.ts`): the track picked for the video that was
 * playing before a reload. The stored preferences are untouched.
 */
export function restorePickedTrack(picked: PickedTrack | null): void {
  if (picked === state.picked) return;
  state = { ...state, picked };
  for (const listener of listeners) listener();
}

/** Back to the defaults (tests). */
export function resetVideoPrefs(): void {
  set({ ...DEFAULT_VIDEO_PREFS, picked: null });
}
