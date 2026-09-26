import { z } from 'zod';
import { type PlayerState, hydratePlayer, playerState, subscribePlayer } from './player-state';
import {
  type PickedTrack,
  restorePickedTrack,
  subscribeVideoPrefs,
  videoPrefs,
} from './video-prefs';

/*
 * The player session (frontend skill "Player", "Session"): the queue, the position and whether
 * it played, kept in this browser's localStorage so a reload picks up where it was. A per-viewer
 * convenience like the volume and the video preferences; storage can be missing or refuse (a
 * private window), and then a reload simply starts without a player.
 */

export const SESSION_KEY = 'mytube.player.session';
/** Sessions older than this are ignored (and cleared). */
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** At most this many queue items are saved (a window around the current one). */
export const SESSION_QUEUE_CAP = 500;
/** While playing, the position is saved at most this often. */
export const POS_SAVE_INTERVAL_MS = 2000;

const Kind = z.enum(['music', 'video']);

const Item = z.object({
  kind: Kind,
  id: z.number().int(),
  title: z.string(),
  sub: z.string(),
  album: z.string().optional(),
  albumId: z.number().int().optional(),
  when: z.string().optional(),
  channelPageId: z.number().int().optional(),
  container: z.string().optional(),
  dur: z.number().nonnegative(),
  artUrl: z.string().nullable(),
  fileUrl: z.string(),
  missing: z.boolean().optional(),
});

const Session = z
  .object({
    kind: Kind,
    queue: z.array(Item).min(1).max(SESSION_QUEUE_CAP),
    index: z.number().int().nonnegative(),
    pos: z.number().nonnegative(),
    from: z.string(),
    playing: z.boolean(),
    cardOpen: z.boolean(),
    savedAt: z.number(),
    picked: z.object({ videoId: z.number().int(), index: z.number().int() }).nullable().optional(),
  })
  .refine((session) => session.queue[session.index]?.kind === session.kind);

export type PlayerSession = z.infer<typeof Session>;

/** Where sessions are kept (localStorage, or a stand-in in tests). */
export type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): SessionStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The session to save for a state, or null without a player. Transient fields (buffering, the
 * error line, the counters) are left out; a queue over the cap keeps a window around the current
 * item.
 */
export function sessionOf(
  value: Pick<PlayerState, 'player' | 'cardOpen'>,
  picked: PickedTrack | null,
  savedAt: number,
): PlayerSession | null {
  const { player } = value;
  if (!player || !player.queue[player.index]) return null;
  let { queue, index } = player;
  if (queue.length > SESSION_QUEUE_CAP) {
    const start = Math.min(
      Math.max(0, index - Math.floor(SESSION_QUEUE_CAP / 5)),
      queue.length - SESSION_QUEUE_CAP,
    );
    queue = queue.slice(start, start + SESSION_QUEUE_CAP);
    index -= start;
  }
  return {
    kind: player.kind,
    queue: [...queue],
    index,
    pos: Number.isFinite(player.pos) ? Math.max(0, player.pos) : 0,
    from: player.from,
    playing: player.playing,
    cardOpen: value.cardOpen,
    savedAt,
    picked,
  };
}

/** A stored session, or null when there is none, it is malformed, or older than 7 days. */
export function readSession(raw: string | null | undefined, now: number): PlayerSession | null {
  if (!raw) return null;
  try {
    const parsed = Session.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const age = now - parsed.data.savedAt;
    return age >= 0 && age <= SESSION_MAX_AGE_MS ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeSession(storage: SessionStorage | null, session: PlayerSession): void {
  try {
    storage?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage refused (full, a private window): the session lasts until the page goes.
  }
}

/** Forgets the saved session (the player closed, or what was stored is unusable). */
export function clearSession(storage: SessionStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear without storage.
  }
}

/**
 * On app start, before the shell renders: hydrates the player store from the saved session
 * (paused, at the saved position; the engines load the item there and try to play once when it
 * was playing). An old or malformed session is cleared. Returns whether a session was restored.
 */
export function restorePlayerSession(
  storage: SessionStorage | null = browserStorage(),
  now: number = Date.now(),
): boolean {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(SESSION_KEY) ?? null;
  } catch {
    return false;
  }
  if (raw === null) return false;
  const session = readSession(raw, now);
  if (!session) {
    clearSession(storage);
    return false;
  }
  if (session.kind === 'video') restorePickedTrack(session.picked ?? null);
  hydratePlayer(session);
  return playerState().player !== null;
}

export interface PersistenceOptions {
  storage?: SessionStorage | null;
  now?: () => number;
  /** Where `beforeunload` and `visibilitychange` are heard (the window; none in tests). */
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  /** Whether the page is hidden (`visibilitychange` saves on the way out). */
  hidden?: () => boolean;
}

/**
 * Keeps the saved session in step with the player store: the queue, index, `from`, playing, the
 * card, a seek and the picked captions track save at once; the position alone at most every 2 s
 * while playing, and once more on `beforeunload` and when the page is hidden. Closing the player
 * clears it. Returns the stop function.
 */
export function startPlayerSessionPersistence(options: PersistenceOptions = {}): () => void {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const now = options.now ?? Date.now;
  const target = options.target === undefined ? globalThis.window : options.target;
  const hidden = options.hidden ?? (() => globalThis.document?.visibilityState === 'hidden');

  let last = playerState();
  let lastPicked = videoPrefs().picked;
  let savedAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const save = () => {
    cancelTimer();
    const session = sessionOf(playerState(), videoPrefs().picked, now());
    if (!session) return;
    writeSession(storage, session);
    savedAt = session.savedAt;
  };

  const onPlayer = () => {
    const current = playerState();
    const previous = last;
    last = current;
    const player = current.player;
    const before = previous.player;
    if (!player) {
      cancelTimer();
      if (before) clearSession(storage);
      return;
    }
    const changed =
      !before ||
      player.queue !== before.queue ||
      player.index !== before.index ||
      player.from !== before.from ||
      player.kind !== before.kind ||
      player.playing !== before.playing ||
      current.cardOpen !== previous.cardOpen ||
      current.seekRequest !== previous.seekRequest;
    if (changed) {
      save();
      return;
    }
    if (player.pos === before.pos || timer !== null) return;
    const wait = POS_SAVE_INTERVAL_MS - (now() - savedAt);
    if (wait <= 0) save();
    else timer = setTimeout(save, wait);
  };
  const onPrefs = () => {
    const { picked } = videoPrefs();
    if (picked === lastPicked) return;
    lastPicked = picked;
    if (playerState().player) save();
  };
  const onUnload = () => {
    if (playerState().player) save();
  };
  const onVisibility = () => {
    if (hidden()) onUnload();
  };

  const stopPlayer = subscribePlayer(onPlayer);
  const stopPrefs = subscribeVideoPrefs(onPrefs);
  target?.addEventListener('beforeunload', onUnload);
  target?.addEventListener('visibilitychange', onVisibility);
  return () => {
    cancelTimer();
    stopPlayer();
    stopPrefs();
    target?.removeEventListener('beforeunload', onUnload);
    target?.removeEventListener('visibilitychange', onVisibility);
  };
}
