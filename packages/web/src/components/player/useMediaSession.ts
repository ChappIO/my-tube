import { useEffect } from 'react';
import {
  type PlayerItem,
  currentItem,
  next,
  playerState,
  prev,
  seek,
  setPlaying,
  usePlayerState,
} from '../../player-state';
import { useVideoPrefs } from '../../video-prefs';

/**
 * The Media Session metadata for an item: title, artist (the item's `sub`: the artist or the
 * channel), album and the cover or video thumbnail as artwork (a same-origin path; the browser
 * resolves it against the page).
 */
export function mediaMetadataInit(item: PlayerItem): MediaMetadataInit {
  const init: MediaMetadataInit = { title: item.title, artist: item.sub };
  if (item.album !== undefined) init.album = item.album;
  if (item.artUrl) init.artwork = [{ src: item.artUrl }];
  return init;
}

/** The actions the lock screen, the keyboard's media keys and headsets can send. */
export const MEDIA_SESSION_ACTIONS = [
  'play',
  'pause',
  'previoustrack',
  'nexttrack',
  'seekto',
] as const satisfies readonly MediaSessionAction[];

/** The store action each Media Session action runs. */
export const MEDIA_SESSION_HANDLERS: Record<
  (typeof MEDIA_SESSION_ACTIONS)[number],
  MediaSessionActionHandler
> = {
  play: () => setPlaying(true),
  pause: () => setPlaying(false),
  previoustrack: () => prev(),
  nexttrack: () => next(),
  seekto: (details) => {
    if (details.seekTime !== undefined) seek(details.seekTime);
  },
};

/** Sets or clears the handlers on a session (every action, or null for each). */
export function registerMediaSession(
  session: Pick<MediaSession, 'setActionHandler'>,
  active: boolean,
): void {
  for (const action of MEDIA_SESSION_ACTIONS) {
    try {
      session.setActionHandler(action, active ? MEDIA_SESSION_HANDLERS[action] : null);
    } catch {
      // A browser that does not know the action throws; the rest still register.
    }
  }
}

function mediaSession(): MediaSession | null {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
    ? navigator.mediaSession
    : null;
}

/**
 * Mirrors the player in `navigator.mediaSession`: the current item's metadata, the playback
 * state and the position, and handlers for play, pause, previous, next and seek. Everything is
 * cleared when the player closes. Mount once (the shell's `PlayerLayer`).
 */
export function useMediaSession(): void {
  const { player } = usePlayerState();
  const item = currentItem(player);
  const active = player !== null;
  const playing = player?.playing ?? false;

  useEffect(() => {
    const session = mediaSession();
    if (!session) return undefined;
    registerMediaSession(session, active);
    return () => registerMediaSession(session, false);
  }, [active]);

  useEffect(() => {
    const session = mediaSession();
    if (!session) return;
    session.metadata =
      item && typeof MediaMetadata !== 'undefined'
        ? new MediaMetadata(mediaMetadataInit(item))
        : null;
    // Only the item matters here: the position has its own effect.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.kind, item?.id, item?.title, item?.artUrl, player?.index, active]);

  useEffect(() => {
    const session = mediaSession();
    if (!session) return;
    session.playbackState = !active ? 'none' : playing ? 'playing' : 'paused';
  }, [active, playing]);

  const pos = player?.pos ?? 0;
  const dur = item?.dur ?? 0;
  const { speed } = useVideoPrefs();
  const rate = item?.kind === 'video' ? speed : 1;
  useEffect(() => {
    const session = mediaSession();
    if (!session?.setPositionState || !playerState().player || dur <= 0) return;
    try {
      session.setPositionState({ duration: dur, position: Math.min(pos, dur), playbackRate: rate });
    } catch {
      // An inconsistent state (the position a moment past a rounded duration) is not worth failing.
    }
  }, [pos, dur, rate]);
}
