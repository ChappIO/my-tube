import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type Player,
  type PlayerItem,
  playQueue,
  playerState,
  resetPlayer,
} from '../../player-state';
import { UpNextRow } from './FloatingCard';
import { PlayerBar, barSubLine } from './PlayerBar';
import { QueuePanel, queueRowMarker } from './QueuePanel';
import { progressFraction, seekPosition } from './Scrubber';
import { shortcutFor, shouldHandleKey } from './useKeyboardShortcuts';
import {
  MEDIA_SESSION_ACTIONS,
  MEDIA_SESSION_HANDLERS,
  mediaMetadataInit,
  registerMediaSession,
} from './useMediaSession';

function item(id: number, extra: Partial<PlayerItem> = {}): PlayerItem {
  return {
    kind: 'music',
    id,
    title: `Track ${id}`,
    sub: 'Radiohead',
    album: 'In Rainbows',
    albumId: 3,
    dur: 245,
    artUrl: `/api/artwork/album/3`,
    fileUrl: `/api/library/tracks/${id}/stream`,
    ...extra,
  };
}

function queue(length: number, index: number, extra: Partial<Player> = {}): Player {
  return {
    kind: 'music',
    queue: Array.from({ length }, (_, n) => item(n + 1)),
    index,
    playing: true,
    pos: 61.7,
    from: 'In Rainbows',
    ...extra,
  };
}

afterEach(() => {
  resetPlayer();
});

const renderBar = (player: Player, error: string | null = null) =>
  renderToStaticMarkup(
    <PlayerBar
      player={player}
      buffering={false}
      error={error}
      onOpenNowPlaying={() => undefined}
      onClose={() => undefined}
    />,
  );

const key = (value: string, target: object | null = null, extra = {}) => ({
  key: value,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  defaultPrevented: false,
  target,
  ...extra,
});

describe('PlayerBar', () => {
  it('shows the queue label, the times and the sub line', () => {
    const html = renderBar(queue(10, 2));
    expect(html).toContain('3 of 10 · In Rainbows');
    expect(html).toContain('Radiohead · In Rainbows');
    expect(html).toContain('1:01');
    expect(html).toContain('4:05');
    expect(html).toContain('aria-label="Pause"');
    expect(html).toContain('aria-label="Open Now Playing"');
    expect(html).toContain('aria-label="Close player"');
  });

  it('shows Play while paused and the error line instead of the sub line', () => {
    const html = renderBar(
      queue(2, 0, { playing: false }),
      'This file could not be played. Skipping.',
    );
    expect(html).toContain('aria-label="Play"');
    expect(html).toContain('This file could not be played. Skipping.');
    expect(html).not.toContain('Radiohead · In Rainbows');
  });

  it('names the channel alone for an item without an album', () => {
    expect(barSubLine(item(1, { album: undefined }))).toBe('Radiohead');
  });
});

describe('UpNextRow', () => {
  it('names the next item and skips to it', () => {
    const html = renderToStaticMarkup(<UpNextRow item={item(4)} onNext={() => undefined} />);
    expect(html).toContain('Up next');
    expect(html).toContain('Track 4');
    expect(html).not.toContain('disabled');
  });

  it('reads "End of queue" at the end and does nothing', () => {
    const html = renderToStaticMarkup(<UpNextRow item={null} onNext={() => undefined} />);
    expect(html).toContain('End of queue');
    expect(html).toContain('disabled');
  });
});

describe('QueuePanel', () => {
  it('marks the current row with ▶ while playing and ❙❙ while paused', () => {
    expect(queueRowMarker(0, queue(3, 1))).toBe('01');
    expect(queueRowMarker(1, queue(3, 1))).toBe('▶');
    expect(queueRowMarker(1, queue(3, 1, { playing: false }))).toBe('❙❙');
    expect(queueRowMarker(11, queue(12, 1))).toBe('12');
  });

  it('lists every item with the header label and the current row', () => {
    const player = queue(3, 1);
    player.queue = [...player.queue, item(9, { missing: true })];
    const html = renderToStaticMarkup(<QueuePanel player={player} onJump={() => undefined} />);
    expect(html).toContain('2 of 4 · In Rainbows');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toContain('Radiohead · not on disk');
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
});

describe('Scrubber math', () => {
  it('computes the fill and the position a click points at', () => {
    expect(progressFraction(30, 120)).toBe(0.25);
    expect(progressFraction(10, 0)).toBe(0);
    expect(progressFraction(200, 120)).toBe(1);
    expect(seekPosition(150, 100, 200, 240)).toBe(60);
    expect(seekPosition(50, 100, 200, 240)).toBe(0);
  });
});

describe('keyboard shortcuts', () => {
  it('maps Space, the arrows, J, L and Esc', () => {
    expect(shortcutFor(' ')).toBe('toggle');
    expect(shortcutFor('ArrowRight')).toBe('forward');
    expect(shortcutFor('L')).toBe('forward');
    expect(shortcutFor('ArrowLeft')).toBe('back');
    expect(shortcutFor('j')).toBe('back');
    expect(shortcutFor('Escape')).toBe('leave');
    expect(shortcutFor('k')).toBeNull();
  });

  it('stays out of text fields, contenteditable and selects', () => {
    expect(shouldHandleKey(key('j', { tagName: 'INPUT' }), false)).toBe(false);
    expect(shouldHandleKey(key(' ', { tagName: 'TEXTAREA' }), false)).toBe(false);
    expect(shouldHandleKey(key('ArrowLeft', { tagName: 'SELECT' }), false)).toBe(false);
    expect(shouldHandleKey(key('l', { tagName: 'DIV', isContentEditable: true }), false)).toBe(
      false,
    );
    expect(shouldHandleKey(key('l', { tagName: 'DIV', closest: () => null }), false)).toBe(true);
    expect(shouldHandleKey(key(' '), false)).toBe(true);
  });

  it('leaves Space to a focused button, modifiers to the browser and keys to an open modal', () => {
    const button = { tagName: 'BUTTON', closest: () => ({}) };
    expect(shouldHandleKey(key(' ', button), false)).toBe(false);
    expect(shouldHandleKey(key('ArrowRight', button), false)).toBe(true);
    expect(shouldHandleKey(key('l', null, { metaKey: true }), false)).toBe(false);
    expect(shouldHandleKey(key('Escape'), true)).toBe(false);
  });
});

describe('Media Session', () => {
  it('maps an item to title, artist, album and artwork', () => {
    expect(mediaMetadataInit(item(1))).toEqual({
      title: 'Track 1',
      artist: 'Radiohead',
      album: 'In Rainbows',
      artwork: [{ src: '/api/artwork/album/3' }],
    });
    expect(mediaMetadataInit(item(2, { album: undefined, artUrl: null }))).toEqual({
      title: 'Track 2',
      artist: 'Radiohead',
    });
  });

  it('registers every handler and clears them again', () => {
    const setActionHandler = vi.fn<MediaSession['setActionHandler']>();
    const session = { setActionHandler };
    registerMediaSession(session, true);
    expect(setActionHandler.mock.calls.map(([action]) => action)).toEqual([
      ...MEDIA_SESSION_ACTIONS,
    ]);
    expect(setActionHandler.mock.calls.every(([, handler]) => typeof handler === 'function')).toBe(
      true,
    );
    setActionHandler.mockClear();
    registerMediaSession(session, false);
    expect(setActionHandler.mock.calls.every(([, handler]) => handler === null)).toBe(true);
  });

  it('drives the store from the handlers', () => {
    playQueue([item(1), item(2)], 0, 'In Rainbows');
    MEDIA_SESSION_HANDLERS.pause({ action: 'pause' });
    expect(playerState().player?.playing).toBe(false);
    MEDIA_SESSION_HANDLERS.nexttrack({ action: 'nexttrack' });
    expect(playerState().player).toMatchObject({ index: 1, playing: true });
    MEDIA_SESSION_HANDLERS.seekto({ action: 'seekto', seekTime: 30 });
    expect(playerState().player?.pos).toBe(30);
  });
});
