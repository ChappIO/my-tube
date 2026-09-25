import { useSyncExternalStore } from 'react';

/*
 * The in-app player (frontend skill "Player"): one queue, one thing playing at a time. A tiny
 * external store, the same pattern as `ui-state.ts`. Screens start queues with `playQueue` and
 * `appendToQueue`; the bar calls the transport actions; `AudioEngine` (the one `<audio>` element,
 * mounted once in the shell) follows the store and reports the position back.
 *
 * Music and video never share a queue: starting either replaces whatever plays. `AudioEngine`
 * plays music items and `VideoEngine` video items; each lets go of its element when the other
 * kind plays.
 */

export type PlayerKind = 'music' | 'video';

/** One entry of the queue. */
export interface PlayerItem {
  kind: PlayerKind;
  /** The track or video id. */
  id: number;
  title: string;
  /** The artist (music) or the channel (video). */
  sub: string;
  /** Music: the album title. */
  album?: string;
  /** Music: the album id, for the Now Playing cover link to the album page. */
  albumId?: number;
  /** Video: the relative upload date. */
  when?: string;
  /** Video: the channel page's id (its source), for the channel link in Now Playing. */
  channelPageId?: number;
  /** Video: the file's container (`mp4`, `mkv`), for Now Playing's meta line. */
  container?: string;
  /** Seconds; 0 when unknown (the element's duration replaces it once loaded). */
  dur: number;
  /** The cover or thumbnail, null without art. */
  artUrl: string | null;
  /** The stream the media element plays. */
  fileUrl: string;
  /**
   * Not on disk. Only an explicit add to queue ("+" on an album row) puts one in the queue; it
   * shows muted there and the transport steps over it.
   */
  missing?: boolean;
}

export interface Player {
  kind: PlayerKind;
  queue: readonly PlayerItem[];
  index: number;
  playing: boolean;
  /** Seconds into the current item. */
  pos: number;
  /** What created the queue: album title, artist, playlist, "Tracks", "Home", "Queue"; " +" once something was appended. */
  from: string;
}

export interface PlayerState {
  player: Player | null;
  /** The floating card is shown (it opens with every new queue until dismissed). */
  cardOpen: boolean;
  /** The Now Playing page is on screen (it hides the card). */
  nowOpen: boolean;
  /** Now Playing's frame or panel is fullscreen (it follows the browser's `fullscreenchange`). */
  fullscreen: boolean;
  /** The media element is waiting for data: a spinner in the play circle. */
  buffering: boolean;
  /** The current item failed to load: a muted line in the bar; the engine skips on after 2 s. */
  error: string | null;
  /** Bumps whenever the current item has to (re)load from the start: a new queue, a jump, next, prev. */
  load: number;
  /** Bumps on every seek the element must follow (the scrubber, ±10 s, prev's restart). */
  seekRequest: number;
  /** The volume of both engines, 0 to 1 (kept while muted). */
  volume: number;
  /** Muted (M, the bar's button); the volume is kept for unmuting. */
  muted: boolean;
}

/** Previous restarts the current item after this many seconds, else goes back one. */
export const PREV_RESTART_SECONDS = 4;
/** The keyboard's seek step (← → J L). */
export const SEEK_STEP_SECONDS = 10;
/** How long the error line shows before the engine moves to the next item. */
export const ERROR_SKIP_MS = 2000;
/** The suffix `from` gets once something was added to the queue. */
export const APPENDED_SUFFIX = ' +';
/** The volume step of ↑ ↓ and of the slider's ← →. */
export const VOLUME_STEP = 0.05;
/** Where this browser keeps the volume and mute (a per-viewer convenience). */
export const VOLUME_STORAGE_KEY = 'mytube.player.volume';

/** The volume clamped to 0..1 (and rounded to 1/1000, so steps of 5 % stay exact). */
export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.round(Math.min(1, Math.max(0, volume)) * 1000) / 1000;
}

/** The stored volume and mute, or the defaults (full, not muted) for anything unreadable. */
export function readVolume(raw: string | null | undefined): { volume: number; muted: boolean } {
  try {
    const stored: unknown = raw ? JSON.parse(raw) : null;
    if (typeof stored !== 'object' || stored === null) return { volume: 1, muted: false };
    const volume = 'volume' in stored ? stored.volume : undefined;
    const muted = 'muted' in stored ? stored.muted : undefined;
    return {
      volume: typeof volume === 'number' ? clampVolume(volume) : 1,
      muted: muted === true,
    };
  } catch {
    return { volume: 1, muted: false };
  }
}

function storedVolume(): { volume: number; muted: boolean } {
  try {
    return readVolume(globalThis.localStorage?.getItem(VOLUME_STORAGE_KEY));
  } catch {
    return { volume: 1, muted: false };
  }
}

function saveVolume(volume: number, muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(VOLUME_STORAGE_KEY, JSON.stringify({ volume, muted }));
  } catch {
    // No storage (a private window): the level lasts for the session.
  }
}

const INITIAL: PlayerState = {
  player: null,
  cardOpen: false,
  nowOpen: false,
  fullscreen: false,
  buffering: false,
  error: null,
  load: 0,
  seekRequest: 0,
  volume: 1,
  muted: false,
};

let state: PlayerState = { ...INITIAL, ...storedVolume() };
/** The last level above 0, which unmuting from 0 goes back to. */
let audibleVolume = state.volume > 0 ? state.volume : 1;
const listeners = new Set<() => void>();

function set(nextState: PlayerState): void {
  if (nextState === state) return;
  state = nextState;
  for (const listener of listeners) listener();
}

function patchPlayer(patch: Partial<Player>, extra: Partial<PlayerState> = {}): void {
  if (!state.player) return;
  set({ ...state, ...extra, player: { ...state.player, ...patch } });
}

/** Subscribes to changes; returns the unsubscribe function. */
export function subscribePlayer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current state (a new object on every change). */
export function playerState(): PlayerState {
  return state;
}

/** The player state for components. */
export function usePlayerState(): PlayerState {
  return useSyncExternalStore(subscribePlayer, playerState, () => INITIAL);
}

/** Whether a queue exists (re-renders only when that changes, not on every position update). */
export function usePlayerActive(): boolean {
  return useSyncExternalStore(
    subscribePlayer,
    () => state.player !== null,
    () => false,
  );
}

/** The item being played, or null. */
export function currentItem(player: Player | null): PlayerItem | null {
  return player?.queue[player.index] ?? null;
}

/** The index of the next item that can play after `from` (stepping over missing ones), or -1. */
export function playableAfter(queue: readonly PlayerItem[], from: number): number {
  for (let index = from + 1; index < queue.length; index += 1) {
    if (!queue[index]!.missing) return index;
  }
  return -1;
}

/** The index of the item that can play before `from`, or -1. */
export function playableBefore(queue: readonly PlayerItem[], from: number): number {
  for (let index = from - 1; index >= 0; index -= 1) {
    if (!queue[index]!.missing) return index;
  }
  return -1;
}

/** The item the Up next row names, or null at the end of the queue. */
export function upNext(player: Player | null): PlayerItem | null {
  if (!player) return null;
  const index = playableAfter(player.queue, player.index);
  return index === -1 ? null : player.queue[index]!;
}

/**
 * Starts a new queue at `index` (replacing whatever plays: one thing at a time) and opens the
 * card. A missing item at `index` starts at the next one that can play; a queue with nothing
 * playable does nothing.
 */
export function playQueue(items: readonly PlayerItem[], index: number, from: string): void {
  const start = items[index] && !items[index].missing ? index : playableAfter(items, index);
  if (start === -1) return;
  set({
    ...state,
    player: {
      kind: items[start]!.kind,
      queue: [...items],
      index: start,
      playing: true,
      pos: 0,
      from,
    },
    cardOpen: !state.nowOpen,
    buffering: false,
    error: null,
    load: state.load + 1,
  });
}

/**
 * Add to queue: appends when the kind matches what plays (and `from` gets the " +" suffix);
 * otherwise, or with nothing playing, starts a new one-item queue from "Queue".
 */
export function appendToQueue(item: PlayerItem): void {
  const { player } = state;
  if (!player || player.kind !== item.kind) {
    playQueue([item], 0, 'Queue');
    return;
  }
  const from = player.from.endsWith(APPENDED_SUFFIX) ? player.from : player.from + APPENDED_SUFFIX;
  patchPlayer({ queue: [...player.queue, item], from });
}

/** Play or pause. Playing again after the end of the queue restarts the last item. */
export function togglePlay(): void {
  const { player } = state;
  if (!player) return;
  if (player.playing) {
    patchPlayer({ playing: false });
    return;
  }
  const item = currentItem(player);
  const ended = item !== null && item.dur > 0 && player.pos >= item.dur;
  if (ended) {
    patchPlayer({ playing: true, pos: 0 }, { seekRequest: state.seekRequest + 1 });
  } else {
    patchPlayer({ playing: true });
  }
}

/** Sets playing without toggling (the Media Session's play and pause, the element's own pause). */
export function setPlaying(playing: boolean): void {
  if (!state.player || state.player.playing === playing) return;
  if (playing) togglePlay();
  else patchPlayer({ playing: false });
}

/**
 * Next (the button, the card's Up next and auto-advance): the next item that can play, from the
 * start. At the end of the queue playback stops with the position at the end.
 */
export function next(): void {
  const { player } = state;
  if (!player) return;
  const target = playableAfter(player.queue, player.index);
  if (target === -1) {
    const item = currentItem(player);
    patchPlayer(
      { playing: false, pos: item?.dur ?? player.pos },
      { buffering: false, error: null },
    );
    return;
  }
  patchPlayer(
    { index: target, pos: 0, playing: true },
    { buffering: false, error: null, load: state.load + 1 },
  );
}

/**
 * Previous: past 4 s it restarts the current item; otherwise it goes back one (at the first
 * item it restarts).
 */
export function prev(): void {
  const { player } = state;
  if (!player) return;
  const target = playableBefore(player.queue, player.index);
  if (player.pos > PREV_RESTART_SECONDS || target === -1) {
    seek(0);
    return;
  }
  patchPlayer({ index: target, pos: 0 }, { buffering: false, error: null, load: state.load + 1 });
}

/** Moves the position (clamped to the item) and tells the element to follow. */
export function seek(pos: number): void {
  const { player } = state;
  if (!player) return;
  const dur = currentItem(player)?.dur ?? 0;
  const clamped = Math.max(0, dur > 0 ? Math.min(pos, dur) : pos);
  patchPlayer({ pos: clamped }, { seekRequest: state.seekRequest + 1 });
}

/** Seeks by `delta` seconds from the current position (the keyboard's ±10 s). */
export function seekBy(delta: number): void {
  if (!state.player) return;
  seek(state.player.pos + delta);
}

/** Jumps to a queue item and plays it (a Now Playing queue row). Missing items do nothing. */
export function jumpTo(index: number): void {
  const { player } = state;
  const item = player?.queue[index];
  if (!player || !item || item.missing) return;
  patchPlayer(
    { index, pos: 0, playing: true },
    { buffering: false, error: null, load: state.load + 1 },
  );
}

/** Clears the queue and closes the player (the bar's ×). */
export function closePlayer(): void {
  if (!state.player) return;
  set({ ...state, player: null, cardOpen: false, buffering: false, error: null });
}

/**
 * Opens the floating card again (Now Playing's Pop out): it shows once Now Playing is left, with
 * the video playing on in it.
 */
export function openCard(): void {
  if (!state.player || state.cardOpen) return;
  set({ ...state, cardOpen: true });
}

/** Dismisses the floating card (its ×); the next `playQueue` opens it again. */
export function dismissCard(): void {
  if (!state.cardOpen) return;
  set({ ...state, cardOpen: false });
}

/** The Now Playing page mounts (true) or unmounts (false). Opening it closes the card. */
export function setNowOpen(open: boolean): void {
  if (state.nowOpen === open) return;
  set({ ...state, nowOpen: open, cardOpen: open ? false : state.cardOpen });
}

/** Now Playing's frame or panel entered (true) or left (false) fullscreen. */
export function setFullscreen(fullscreen: boolean): void {
  if (state.fullscreen === fullscreen) return;
  set({ ...state, fullscreen });
}

/** The element's clock (`timeupdate`). */
export function reportPosition(pos: number): void {
  if (!state.player || state.player.pos === pos) return;
  patchPlayer({ pos });
}

/** The element's duration once known: it replaces the item's (the DTO's may be missing or rounded). */
export function reportDuration(dur: number): void {
  const { player } = state;
  const item = currentItem(player);
  if (!player || !item || !Number.isFinite(dur) || dur <= 0 || item.dur === dur) return;
  const queue = player.queue.map((entry, index) =>
    index === player.index ? { ...entry, dur } : entry,
  );
  patchPlayer({ queue });
}

/** The element waits for data (true) or plays (false). */
export function reportBuffering(buffering: boolean): void {
  if (state.buffering === buffering) return;
  set({ ...state, buffering });
}

/** The current item failed to load (a message), or recovered (null). */
export function reportError(error: string | null): void {
  if (state.error === error) return;
  set({ ...state, error, buffering: false });
}

/**
 * Sets the volume (the bar's slider, ↑ ↓). Anything above 0 unmutes, so dragging up from 0 or
 * from muted brings the sound back; 0 shows the muted glyph (`isSilent`).
 */
export function setVolume(volume: number): void {
  const next = clampVolume(volume);
  const muted = next > 0 ? false : state.muted;
  if (next > 0) audibleVolume = next;
  if (next === state.volume && muted === state.muted) return;
  set({ ...state, volume: next, muted });
  saveVolume(next, muted);
}

/**
 * A drag on the slider ended: when it ended at 0, unmuting goes back to the level it started
 * from (not to the last level passed on the way down).
 */
export function settleVolume(startedAt: number): void {
  if (state.volume === 0 && startedAt > 0) audibleVolume = clampVolume(startedAt);
}

/** ↑ ↓ (and the slider's ← →): the volume by `delta`. */
export function changeVolume(delta: number): void {
  setVolume((state.muted ? 0 : state.volume) + delta);
}

/**
 * M and the bar's button: mute keeps the level; unmute restores it (or the last level above 0
 * when the slider was dragged to 0).
 */
export function toggleMute(): void {
  if (state.muted || state.volume === 0) {
    const volume = state.volume > 0 ? state.volume : audibleVolume;
    set({ ...state, muted: false, volume });
    saveVolume(volume, false);
    return;
  }
  set({ ...state, muted: true });
  saveVolume(state.volume, true);
}

/** Nothing is heard: muted, or the volume at 0 (the muted glyph shows). */
export function isSilent(value: Pick<PlayerState, 'volume' | 'muted'>): boolean {
  return value.muted || value.volume === 0;
}

/** What the slider shows: 0 while muted, else the volume. */
export function shownVolume(value: Pick<PlayerState, 'volume' | 'muted'>): number {
  return value.muted ? 0 : value.volume;
}

/** What an engine sets on its media element. */
export interface VolumeTarget {
  volume: number;
  muted: boolean;
}

/** Applies the store's volume and mute to a media element (both engines, on change and load). */
export function applyVolume(
  element: VolumeTarget,
  value: Pick<PlayerState, 'volume' | 'muted'>,
): void {
  if (element.volume !== value.volume) element.volume = value.volume;
  if (element.muted !== value.muted) element.muted = value.muted;
}

/** Back to the initial state (tests). */
export function resetPlayer(): void {
  audibleVolume = 1;
  set(INITIAL);
}

/** `3 of 10 · In Rainbows`: the bar's and the queue panel's label. */
export function queueLabel(player: Player): string {
  return `${player.index + 1} of ${player.queue.length} · ${player.from}`;
}
