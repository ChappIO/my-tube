import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type Player,
  type PlayerItem,
  playQueue,
  playerState,
  resetPlayer,
  setFullscreen,
  setNowOpen,
} from '../../player-state';
import { ControlStrip, FullscreenButton } from './ControlStrip';
import {
  type FullscreenDoc,
  type FullscreenTarget,
  exitFullscreenFirst,
  fullscreenLabel,
  fullscreenSupported,
  registerFullscreenToggle,
  toggleFullscreen,
  toggleRegisteredFullscreen,
  watchFullscreen,
} from './fullscreen';
import { popOut } from './now-playing-nav';
import { type ShortcutContext, runShortcut, shortcutFor } from './useKeyboardShortcuts';

/** A document with the standard API (or only the WebKit one), recording its listeners. */
function fakeDoc(prefixed = false) {
  const listeners = new Map<string, () => void>();
  const doc: FullscreenDoc & { fire: () => void; listeners: Map<string, () => void> } = {
    listeners,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    fire: () => {
      for (const listener of listeners.values()) listener();
    },
  };
  if (prefixed) {
    doc.webkitFullscreenEnabled = true;
    doc.webkitFullscreenElement = null;
    doc.webkitExitFullscreen = vi.fn<() => void>(() => {
      doc.webkitFullscreenElement = null;
    });
  } else {
    doc.fullscreenEnabled = true;
    doc.fullscreenElement = null;
    doc.exitFullscreen = vi.fn<() => Promise<void>>(async () => {
      doc.fullscreenElement = null;
    });
  }
  return doc;
}

function fakeWrapper(doc: FullscreenDoc, prefixed = false): FullscreenTarget {
  if (prefixed) {
    const wrapper: FullscreenTarget = {
      webkitRequestFullscreen: vi.fn<() => void>(() => {
        doc.webkitFullscreenElement = wrapper;
      }),
    };
    return wrapper;
  }
  const wrapper: FullscreenTarget = {
    requestFullscreen: vi.fn<() => Promise<void>>(async () => {
      doc.fullscreenElement = wrapper;
    }),
  };
  return wrapper;
}

function video(id: number): PlayerItem {
  return {
    kind: 'video',
    id,
    title: `Video ${id}`,
    sub: 'NASA',
    dur: 60,
    artUrl: null,
    fileUrl: `/api/library/videos/${id}/play`,
  };
}

afterEach(() => {
  resetPlayer();
});

describe('fullscreen', () => {
  it('the pill requests fullscreen on the wrapper, and leaves when the wrapper is fullscreen', async () => {
    const doc = fakeDoc();
    const wrapper = fakeWrapper(doc);
    toggleFullscreen(doc, wrapper);
    await Promise.resolve();
    expect(wrapper.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.fullscreenElement).toBe(wrapper);
    toggleFullscreen(doc, wrapper);
    await Promise.resolve();
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.fullscreenElement).toBeNull();
  });

  it('falls back to the WebKit-prefixed API (Safari)', () => {
    const doc = fakeDoc(true);
    const wrapper = fakeWrapper(doc, true);
    expect(fullscreenSupported(doc)).toBe(true);
    toggleFullscreen(doc, wrapper);
    expect(wrapper.webkitRequestFullscreen).toHaveBeenCalledTimes(1);
    toggleFullscreen(doc, wrapper);
    expect(doc.webkitExitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('ignores a refused request', async () => {
    const doc = fakeDoc();
    const wrapper: FullscreenTarget = {
      requestFullscreen: vi.fn<() => Promise<void>>(async () => {
        throw new TypeError('Permissions check failed');
      }),
    };
    toggleFullscreen(doc, wrapper);
    await Promise.resolve();
    expect(doc.fullscreenElement).toBeNull();
  });

  it('the label follows fullscreenchange, whoever caused it (the browser Esc too)', () => {
    const doc = fakeDoc();
    const wrapper = fakeWrapper(doc);
    const seen: boolean[] = [];
    const stop = watchFullscreen(
      doc,
      () => wrapper,
      (active) => seen.push(active),
    );
    expect([...doc.listeners.keys()]).toEqual(['fullscreenchange', 'webkitfullscreenchange']);
    doc.fullscreenElement = wrapper;
    doc.fire();
    doc.fullscreenElement = { other: true };
    doc.fire();
    doc.fullscreenElement = null;
    doc.fire();
    expect(seen).toEqual([true, true, false, false, false, false]);
    expect(fullscreenLabel(true)).toBe('Exit fullscreen');
    expect(fullscreenLabel(false)).toBe('Fullscreen');
    stop();
    expect(doc.listeners.size).toBe(0);
  });

  it('keeps the store flag', () => {
    setFullscreen(true);
    expect(playerState().fullscreen).toBe(true);
    setFullscreen(false);
    expect(playerState().fullscreen).toBe(false);
  });

  it('hides the pill where the API is unsupported', () => {
    expect(fullscreenSupported(null)).toBe(false);
    expect(fullscreenSupported(fakeDoc())).toBe(true);
    const bare: FullscreenDoc = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    expect(fullscreenSupported(bare)).toBe(false);
    expect(
      renderToStaticMarkup(
        <FullscreenButton supported={false} active={false} onToggle={() => undefined} />,
      ),
    ).toBe('');
    const off = renderToStaticMarkup(
      <FullscreenButton supported active={false} onToggle={() => undefined} />,
    );
    expect(off).toContain('Fullscreen</button>');
    expect(off).toContain('<svg');
    const on = renderToStaticMarkup(
      <FullscreenButton supported active onToggle={() => undefined} />,
    );
    expect(on).toContain('Exit fullscreen</button>');
  });

  it('puts the pill in the strip right group between Pop out and Theater', () => {
    const html = renderToStaticMarkup(
      <ControlStrip
        tracks={[]}
        active={-1}
        onPick={() => undefined}
        subSize="M"
        subBg
        speed={1}
        theater={false}
        onPopOut={() => undefined}
        fullscreen={{ supported: true, active: false, toggle: () => undefined }}
      />,
    );
    expect(html).toMatch(/Pop out[^]*Fullscreen[^]*Theater/);
    const hidden = renderToStaticMarkup(
      <ControlStrip
        tracks={[]}
        active={-1}
        onPick={() => undefined}
        subSize="M"
        subBg
        speed={1}
        theater={false}
        onPopOut={() => undefined}
        fullscreen={{ supported: false, active: false, toggle: () => undefined }}
      />,
    );
    expect(hidden).not.toContain('Fullscreen');
  });

  it('Pop out leaves fullscreen first, then opens the card and leaves Now Playing', async () => {
    setNowOpen(true);
    playQueue([video(1)], 0, 'NASA');
    const doc = fakeDoc();
    const order: string[] = [];
    doc.fullscreenElement = { wrapper: true };
    doc.exitFullscreen = vi.fn<() => Promise<void>>(async () => {
      order.push('exit');
      doc.fullscreenElement = null;
    });
    await popOut(doc, () => order.push(`leave, card ${String(playerState().cardOpen)}`));
    expect(order).toEqual(['exit', 'leave, card true']);
    // Not fullscreen: straight on.
    const calls: string[] = [];
    await exitFullscreenFirst(fakeDoc(), () => calls.push('then'));
    expect(calls).toEqual(['then']);
  });
});

describe('fullscreen keys', () => {
  const player: Player = {
    kind: 'video',
    queue: [video(1)],
    index: 0,
    playing: true,
    pos: 0,
    from: 'NASA',
  };

  function context(extra: Partial<ShortcutContext> = {}): ShortcutContext {
    return {
      state: { player, nowOpen: true, fullscreen: false },
      inFullscreen: false,
      leave: vi.fn<() => void>(),
      toggleFullscreen: vi.fn<() => boolean>(() => true),
      ...extra,
    };
  }

  it('maps F and f to fullscreen', () => {
    expect(shortcutFor('f')).toBe('fullscreen');
    expect(shortcutFor('F')).toBe('fullscreen');
  });

  it('F toggles the registered Now Playing surface, and nothing without one', () => {
    const toggle = vi.fn<() => void>();
    expect(toggleRegisteredFullscreen()).toBe(false);
    const unregister = registerFullscreenToggle(toggle);
    const ctx = context({ toggleFullscreen: toggleRegisteredFullscreen });
    expect(runShortcut('fullscreen', ctx)).toBe(true);
    expect(runShortcut('fullscreen', ctx)).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(2);
    unregister();
    expect(runShortcut('fullscreen', ctx)).toBe(false);
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it('an older registration’s cleanup does not drop a newer one', () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    const dropFirst = registerFullscreenToggle(first);
    const dropSecond = registerFullscreenToggle(second);
    dropFirst();
    expect(toggleRegisteredFullscreen()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    dropSecond();
  });

  it('Esc in fullscreen does not leave Now Playing; outside it does', () => {
    const inside = context({ inFullscreen: true });
    expect(runShortcut('leave', inside)).toBe(false);
    expect(inside.leave).not.toHaveBeenCalled();
    const outside = context();
    expect(runShortcut('leave', outside)).toBe(true);
    expect(outside.leave).toHaveBeenCalledTimes(1);
    const closed = context({ state: { player, nowOpen: false, fullscreen: false } });
    expect(runShortcut('leave', closed)).toBe(false);
  });
});
