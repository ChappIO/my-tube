import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type Player,
  VOLUME_STORAGE_KEY,
  applyVolume,
  changeVolume,
  isSilent,
  playerState,
  readVolume,
  resetPlayer,
  setVolume,
  settleVolume,
  shownVolume,
  toggleMute,
} from '../../player-state';
import { PlayerBar } from './PlayerBar';
import { applyAudioVolume } from './audio-output';
import { VolumeControl, type VolumeEvent, volumeAt, volumeSliderHandlers } from './VolumeControl';
import { shortcutFor } from './useKeyboardShortcuts';

afterEach(() => {
  resetPlayer();
  vi.unstubAllGlobals();
});

const level = () => ({ volume: playerState().volume, muted: playerState().muted });

describe('volume and mute', () => {
  it('mute keeps the level and unmute restores it', () => {
    setVolume(0.6);
    toggleMute();
    expect(level()).toEqual({ volume: 0.6, muted: true });
    expect(isSilent(playerState())).toBe(true);
    expect(shownVolume(playerState())).toBe(0);
    toggleMute();
    expect(level()).toEqual({ volume: 0.6, muted: false });
  });

  it('0 shows as muted, dragging up unmutes, and unmuting from 0 brings the last level back', () => {
    setVolume(0.4);
    setVolume(0);
    expect(isSilent(playerState())).toBe(true);
    toggleMute();
    expect(level()).toEqual({ volume: 0.4, muted: false });
    toggleMute();
    setVolume(0.2);
    expect(level()).toEqual({ volume: 0.2, muted: false });
  });

  it('a drag down to 0 unmutes back to where the drag started', () => {
    setVolume(0.7);
    for (const step of [0.5, 0.2, 0.02, 0]) setVolume(step);
    settleVolume(0.7);
    toggleMute();
    expect(level()).toEqual({ volume: 0.7, muted: false });
  });

  it('steps by 5 % within 0..1, from 0 while muted', () => {
    setVolume(0.98);
    changeVolume(0.05);
    expect(playerState().volume).toBe(1);
    setVolume(0.5);
    changeVolume(-0.05);
    expect(playerState().volume).toBe(0.45);
    toggleMute();
    changeVolume(0.05);
    expect(level()).toEqual({ volume: 0.05, muted: false });
    setVolume(-3);
    expect(playerState().volume).toBe(0);
  });

  it('round-trips through localStorage, and survives storage that refuses', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    setVolume(0.35);
    toggleMute();
    const saved = store.get(VOLUME_STORAGE_KEY);
    expect(readVolume(saved)).toEqual({ volume: 0.35, muted: true });
    expect(readVolume(null)).toEqual({ volume: 1, muted: false });
    expect(readVolume('{"volume":7,"muted":"yes"}')).toEqual({ volume: 1, muted: false });
    expect(readVolume('nope')).toEqual({ volume: 1, muted: false });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => setVolume(0.8)).not.toThrow();
  });

  it('both engines apply it to their element (on change and on every load)', () => {
    const audio = { volume: 1, muted: false };
    const video = { volume: 1, muted: false };
    for (const element of [audio, video]) applyVolume(element, { volume: 0.25, muted: true });
    expect(audio).toEqual({ volume: 0.25, muted: true });
    expect(video).toEqual({ volume: 0.25, muted: true });
  });

  it('maps M to mute and ↑ ↓ to the volume', () => {
    expect(shortcutFor('m')).toBe('mute');
    expect(shortcutFor('M')).toBe('mute');
    expect(shortcutFor('ArrowUp')).toBe('volumeUp');
    expect(shortcutFor('ArrowDown')).toBe('volumeDown');
  });
});

/** A pointer event over an 88px slider starting at x = 20. */
function pointer(clientX: number, captured = true) {
  const setPointerCapture = vi.fn<(id: number) => void>();
  const event: VolumeEvent = {
    button: 0,
    clientX,
    pointerId: 3,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 20, width: 88 }),
      setPointerCapture,
      hasPointerCapture: () => captured,
    },
  };
  return { event, setPointerCapture };
}

describe('volume slider', () => {
  it('maps the press to a fraction of the track', () => {
    expect(volumeAt(20, 20, 88)).toBe(0);
    expect(volumeAt(64, 20, 88)).toBe(0.5);
    expect(volumeAt(200, 20, 88)).toBe(1);
    expect(volumeAt(0, 20, 88)).toBe(0);
  });

  it('captures the pointer, follows captured moves and steps with ← →', () => {
    const onVolume = vi.fn<(volume: number) => void>();
    const onStep = vi.fn<(delta: number) => void>();
    const onSettle = vi.fn<(startedAt: number) => void>();
    const handlers = volumeSliderHandlers(onVolume, onStep, onSettle, () => 0.9);
    const down = pointer(42);
    handlers.onPointerDown(down.event);
    expect(down.setPointerCapture).toHaveBeenCalledWith(3);
    handlers.onPointerMove(pointer(86).event);
    handlers.onPointerMove(pointer(100, false).event);
    expect(onVolume.mock.calls).toEqual([[0.25], [0.75]]);
    handlers.onPointerUp();
    expect(onSettle).toHaveBeenCalledWith(0.9);

    const key = (name: string) => ({
      key: name,
      preventDefault: vi.fn<() => void>(),
      stopPropagation: vi.fn<() => void>(),
    });
    const right = key('ArrowRight');
    handlers.onKeyDown(right);
    handlers.onKeyDown(key('ArrowLeft'));
    handlers.onKeyDown(key('Enter'));
    expect(onStep.mock.calls).toEqual([[0.05], [-0.05]]);
    // Handled here, so the global ← → (±10 s) stays out.
    expect(right.preventDefault).toHaveBeenCalled();
    expect(right.stopPropagation).toHaveBeenCalled();
  });

  it('shows the muted glyph and an empty track while muted, without an outline', () => {
    const on = renderToStaticMarkup(<VolumeControl volume={0.6} muted={false} />);
    expect(on).toContain('aria-label="Mute"');
    expect(on).toContain('width:60%');
    expect(on).toContain('aria-valuetext="60%"');
    const off = renderToStaticMarkup(<VolumeControl volume={0.6} muted />);
    expect(off).toContain('aria-label="Unmute"');
    expect(off).toContain('width:0%');
    expect(off).toContain('aria-valuetext="muted"');
    expect(off).toMatch(/role="slider"[^>]*focus-ring-none/);
  });

  it('sits in the wide row of the bar only (no volume on narrow screens)', () => {
    const player: Player = {
      kind: 'music',
      queue: [
        {
          kind: 'music',
          id: 1,
          title: 'Track',
          sub: 'Artist',
          dur: 100,
          artUrl: null,
          fileUrl: '/api/library/tracks/1/stream',
        },
      ],
      index: 0,
      playing: true,
      pos: 0,
      from: 'Tracks',
    };
    const html = renderToStaticMarkup(
      <PlayerBar
        player={player}
        buffering={false}
        error={null}
        volume={0.5}
        muted={false}
        onOpenNowPlaying={() => undefined}
        onClose={() => undefined}
      />,
    );
    const narrow = html.slice(html.indexOf('wide:hidden'));
    const wide = html.slice(0, html.indexOf('wide:hidden'));
    expect(wide).toContain('aria-label="Volume"');
    expect(wide).toMatch(/^<section[^>]*><div class="hidden [^"]*wide:grid/);
    expect(narrow).not.toContain('aria-label="Volume"');
    expect(narrow).not.toContain('aria-label="Mute"');
  });
});

describe('music volume and the visualizer', () => {
  type Element = { volume: number; muted: boolean };
  function output(connected: boolean) {
    const set = vi.fn<(volume: number, muted: boolean) => void>();
    return { set, connected: vi.fn<(element: Element) => boolean>(() => connected) };
  }

  it('through the graph: the element stays at full volume, the gain gets the level and mute', () => {
    const audio: Element = { volume: 0.3, muted: true };
    const gain = output(true);
    applyAudioVolume(audio, { volume: 0, muted: false }, gain);
    expect(audio).toEqual({ volume: 1, muted: false });
    applyAudioVolume(audio, { volume: 0.4, muted: true }, gain);
    expect(audio).toEqual({ volume: 1, muted: false });
    expect(gain.set.mock.calls).toEqual([
      [0, false],
      [0.4, true],
    ]);
  });

  it('without a graph the element carries the level', () => {
    const audio: Element = { volume: 1, muted: false };
    const gain = output(false);
    applyAudioVolume(audio, { volume: 0.4, muted: true }, gain);
    expect(audio).toEqual({ volume: 0.4, muted: true });
    expect(gain.set).not.toHaveBeenCalled();
  });

  it('switching from the element to the graph moves the level to the gain', () => {
    const audio: Element = { volume: 1, muted: false };
    let connected = false;
    const set = vi.fn<(volume: number, muted: boolean) => void>();
    const gain = { set, connected: () => connected };
    applyAudioVolume(audio, { volume: 0.25, muted: false }, gain);
    expect(audio.volume).toBe(0.25);
    // The first play from a click built the graph; the engine applies the level again.
    connected = true;
    applyAudioVolume(audio, { volume: 0.25, muted: false }, gain);
    expect(audio).toEqual({ volume: 1, muted: false });
    expect(set).toHaveBeenCalledWith(0.25, false);
  });
});
