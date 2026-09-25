import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POS_SAVE_INTERVAL_MS,
  SESSION_KEY,
  SESSION_MAX_AGE_MS,
  SESSION_QUEUE_CAP,
  type SessionStorage,
  readSession,
  restorePlayerSession,
  sessionOf,
  startPlayerSessionPersistence,
} from './player-session';
import {
  type PlayerItem,
  closePlayer,
  dismissCard,
  next,
  playQueue,
  playerState,
  reportBuffering,
  reportError,
  reportPosition,
  resetPlayer,
  seek,
  togglePlay,
} from './player-state';
import { pickTrack, resetVideoPrefs, videoPrefs } from './video-prefs';

const track = (id: number, dur = 200): PlayerItem => ({
  kind: 'music',
  id,
  title: `Track ${id}`,
  sub: 'Hiatus Kaiyote',
  album: 'Choose Your Weapon',
  albumId: 3,
  dur,
  artUrl: null,
  fileUrl: `/api/library/tracks/${id}/file`,
});

function memoryStorage(): SessionStorage & { map: Map<string, string>; writes: number } {
  const map = new Map<string, string>();
  const storage = {
    map,
    writes: 0,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.writes += 1;
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
  return storage;
}

const NOW = 1_800_000_000_000;
let clock = NOW;
let stop: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  clock = NOW;
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
  resetPlayer();
  resetVideoPrefs();
});

function persist(storage: SessionStorage) {
  stop = startPlayerSessionPersistence({ storage, now: () => clock, target: null });
}

const saved = (storage: ReturnType<typeof memoryStorage>): unknown =>
  JSON.parse(storage.map.get(SESSION_KEY) ?? 'null');

describe('player session', () => {
  it('round-trips: saved on a new queue, restored paused at the same place', () => {
    const storage = memoryStorage();
    persist(storage);
    playQueue([track(1), track(2), track(3)], 1, 'Hiatus Kaiyote');
    seek(31);
    reportBuffering(true);
    reportError('boom');
    const session = saved(storage);
    expect(session).toMatchObject({ kind: 'music', index: 1, pos: 31, from: 'Hiatus Kaiyote' });
    expect(session).not.toHaveProperty('buffering');
    expect(session).not.toHaveProperty('error');

    stop?.();
    stop = null;
    resetPlayer();
    const loadBefore = playerState().load;
    const seekBefore = playerState().seekRequest;
    expect(restorePlayerSession(storage, NOW + 1000)).toBe(true);
    const state = playerState();
    expect(state.player).toMatchObject({ index: 1, pos: 31, playing: false });
    expect(state.player!.queue).toHaveLength(3);
    expect(state.cardOpen).toBe(true);
    expect(state.error).toBeNull();
    expect(state.buffering).toBe(false);
    // One load (the engines load once, at the position), no seek request.
    expect(state.load).toBe(loadBefore + 1);
    expect(state.seekRequest).toBe(seekBefore);
    expect(state.resume).toEqual({ load: state.load, autoplay: true });
  });

  it('saves structural changes at once and the position at most every 2 s', () => {
    const storage = memoryStorage();
    persist(storage);
    playQueue([track(1), track(2)], 0, 'Album');
    const afterStart = storage.writes;
    for (let second = 1; second <= 5; second += 1) {
      clock += 500;
      reportPosition(second / 2);
    }
    // 2.5 s of playback: one throttled save at the 2 s mark.
    expect(storage.writes).toBe(afterStart);
    vi.advanceTimersByTime(POS_SAVE_INTERVAL_MS);
    expect(storage.writes).toBe(afterStart + 1);
    clock += 100;
    togglePlay(); // pause: at once
    expect(storage.writes).toBe(afterStart + 2);
    expect(saved(storage)).toMatchObject({ playing: false, pos: 2.5 });
    next();
    expect(saved(storage)).toMatchObject({ index: 1, playing: true });
    dismissCard();
    expect(saved(storage)).toMatchObject({ cardOpen: false });
  });

  it('flushes the position on beforeunload', () => {
    const storage = memoryStorage();
    const target = new EventTarget();
    stop = startPlayerSessionPersistence({
      storage,
      now: () => clock,
      target,
      hidden: () => true,
    });
    playQueue([track(1)], 0, 'Album');
    clock += 100;
    reportPosition(1.2);
    expect(saved(storage)).toMatchObject({ pos: 0 });
    target.dispatchEvent(new Event('beforeunload'));
    expect(saved(storage)).toMatchObject({ pos: 1.2 });
    reportPosition(1.4);
    target.dispatchEvent(new Event('visibilitychange'));
    expect(saved(storage)).toMatchObject({ pos: 1.4 });
  });

  it('clears the session when the player closes', () => {
    const storage = memoryStorage();
    persist(storage);
    playQueue([track(1)], 0, 'Album');
    reportPosition(3);
    closePlayer();
    expect(storage.map.has(SESSION_KEY)).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(storage.map.has(SESSION_KEY)).toBe(false);
    expect(restorePlayerSession(storage, NOW)).toBe(false);
    expect(playerState().player).toBeNull();
  });

  it('ignores and clears old and malformed sessions', () => {
    const storage = memoryStorage();
    const old = sessionOf(
      {
        player: { kind: 'music', queue: [track(1)], index: 0, playing: true, pos: 4, from: 'A' },
        cardOpen: true,
      },
      null,
      NOW - SESSION_MAX_AGE_MS - 1,
    );
    storage.map.set(SESSION_KEY, JSON.stringify(old));
    expect(restorePlayerSession(storage, NOW)).toBe(false);
    expect(storage.map.has(SESSION_KEY)).toBe(false);

    for (const raw of [
      '{nope',
      '{"kind":"music","queue":[],"index":0}',
      JSON.stringify({ ...old, savedAt: NOW, index: 5 }),
    ]) {
      storage.map.set(SESSION_KEY, raw);
      expect(restorePlayerSession(storage, NOW)).toBe(false);
      expect(storage.map.has(SESSION_KEY)).toBe(false);
    }
    expect(playerState().player).toBeNull();
    expect(readSession(JSON.stringify({ ...old, savedAt: NOW }), NOW)).not.toBeNull();
  });

  it('caps the queue at 500 items around the current one', () => {
    const queue = Array.from({ length: 800 }, (_, index) => track(index + 1));
    const session = sessionOf(
      {
        player: { kind: 'music', queue, index: 700, playing: false, pos: 0, from: 'All' },
        cardOpen: false,
      },
      null,
      NOW,
    )!;
    expect(session.queue).toHaveLength(SESSION_QUEUE_CAP);
    expect(session.queue[session.index]!.id).toBe(701);
  });

  it('keeps the captions track picked for the video', () => {
    const storage = memoryStorage();
    persist(storage);
    const video: PlayerItem = { ...track(9), kind: 'video', sub: 'NASA', album: undefined };
    playQueue([video], 0, 'NASA');
    const tracks = [
      { lang: 'en', label: 'English', kind: 'sidecar', url: '/a.vtt' },
      { lang: 'en', label: 'English', kind: 'embedded', url: '/b.vtt' },
    ] satisfies Parameters<typeof pickTrack>[0];
    pickTrack(tracks, 9, 1);
    expect(saved(storage)).toMatchObject({ picked: { videoId: 9, index: 1 } });
    stop?.();
    stop = null;
    resetPlayer();
    resetVideoPrefs();
    restorePlayerSession(storage, NOW);
    expect(videoPrefs().picked).toEqual({ videoId: 9, index: 1 });
    expect(playerState().player?.kind).toBe('video');
  });
});
