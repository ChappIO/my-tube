import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type PlayerItem,
  appendToQueue,
  closePlayer,
  currentItem,
  dismissCard,
  jumpTo,
  openCard,
  next,
  playQueue,
  playerState,
  prev,
  queueLabel,
  reportDuration,
  reportPosition,
  resetPlayer,
  seek,
  seekBy,
  setNowOpen,
  subscribePlayer,
  togglePlay,
  upNext,
} from './player-state';

function item(id: number, extra: Partial<PlayerItem> = {}): PlayerItem {
  return {
    kind: 'music',
    id,
    title: `Track ${id}`,
    sub: 'Radiohead',
    album: 'In Rainbows',
    dur: 200,
    artUrl: null,
    fileUrl: `/api/library/tracks/${id}/stream`,
    ...extra,
  };
}

const player = () => playerState().player!;

afterEach(() => {
  resetPlayer();
});

describe('playQueue', () => {
  it('replaces the queue, plays from the index and opens the card', () => {
    playQueue([item(1), item(2), item(3)], 1, 'In Rainbows');
    expect(player()).toMatchObject({
      kind: 'music',
      index: 1,
      playing: true,
      pos: 0,
      from: 'In Rainbows',
    });
    expect(playerState().cardOpen).toBe(true);
    const load = playerState().load;
    dismissCard();
    playQueue([item(4)], 0, 'Tracks');
    expect(player().queue.map((entry) => entry.id)).toEqual([4]);
    expect(playerState().cardOpen).toBe(true);
    expect(playerState().load).toBe(load + 1);
  });

  it('starts at the next playable item and ignores a queue with none', () => {
    playQueue([item(1, { missing: true }), item(2)], 0, 'Queue');
    expect(player().index).toBe(1);
    resetPlayer();
    playQueue([item(1, { missing: true })], 0, 'Queue');
    expect(playerState().player).toBeNull();
  });

  it('keeps the card closed while Now Playing is open', () => {
    setNowOpen(true);
    playQueue([item(1)], 0, 'Home');
    expect(playerState().cardOpen).toBe(false);
  });

  it('notifies subscribers', () => {
    const listener = vi.fn<() => void>();
    const unsubscribe = subscribePlayer(listener);
    playQueue([item(1)], 0, 'Home');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe('next', () => {
  it('advances and plays from the start, stepping over missing items', () => {
    playQueue([item(1), item(2, { missing: true }), item(3)], 0, 'In Rainbows');
    reportPosition(50);
    next();
    expect(player()).toMatchObject({ index: 2, pos: 0, playing: true });
  });

  it('stops at the end of the queue with the position at the end', () => {
    playQueue([item(1), item(2)], 1, 'In Rainbows');
    reportPosition(120);
    next();
    expect(player()).toMatchObject({ index: 1, playing: false, pos: 200 });
    expect(upNext(player())).toBeNull();
  });

  it('restarts the last item when play is pressed after the end', () => {
    playQueue([item(1)], 0, 'Queue');
    next();
    const seeks = playerState().seekRequest;
    togglePlay();
    expect(player()).toMatchObject({ playing: true, pos: 0 });
    expect(playerState().seekRequest).toBe(seeks + 1);
  });
});

describe('prev', () => {
  it('restarts the current item after 4 s', () => {
    playQueue([item(1), item(2)], 1, 'In Rainbows');
    reportPosition(4.5);
    const seeks = playerState().seekRequest;
    prev();
    expect(player()).toMatchObject({ index: 1, pos: 0 });
    expect(playerState().seekRequest).toBe(seeks + 1);
  });

  it('goes back one item within the first 4 s', () => {
    playQueue([item(1), item(2)], 1, 'In Rainbows');
    reportPosition(4);
    prev();
    expect(player()).toMatchObject({ index: 0, pos: 0 });
  });

  it('restarts at the first item', () => {
    playQueue([item(1), item(2)], 0, 'In Rainbows');
    reportPosition(2);
    prev();
    expect(player()).toMatchObject({ index: 0, pos: 0 });
  });
});

describe('seek', () => {
  it('clamps to the item and asks the element to follow', () => {
    playQueue([item(1)], 0, 'Queue');
    seek(500);
    expect(player().pos).toBe(200);
    seekBy(-300);
    expect(player().pos).toBe(0);
    seekBy(10);
    expect(player().pos).toBe(10);
  });

  it('takes the duration the element reports', () => {
    playQueue([item(1, { dur: 0 })], 0, 'Queue');
    reportDuration(241.5);
    expect(currentItem(player())?.dur).toBe(241.5);
  });
});

describe('appendToQueue', () => {
  it('appends to a queue of the same kind and marks the label once', () => {
    playQueue([item(1), item(2)], 0, 'In Rainbows');
    appendToQueue(item(9));
    appendToQueue(item(10));
    expect(player().queue.map((entry) => entry.id)).toEqual([1, 2, 9, 10]);
    expect(player().from).toBe('In Rainbows +');
    expect(player().index).toBe(0);
    expect(queueLabel(player())).toBe('1 of 4 · In Rainbows +');
  });

  it('starts a one-item queue from "Queue" when the kind differs', () => {
    playQueue([item(1, { kind: 'video' })], 0, 'NASA');
    appendToQueue(item(9));
    expect(player()).toMatchObject({ kind: 'music', index: 0, from: 'Queue', playing: true });
    expect(player().queue).toHaveLength(1);
  });

  it('starts a one-item queue when nothing plays', () => {
    appendToQueue(item(9));
    expect(player()).toMatchObject({ from: 'Queue', index: 0 });
  });

  it('keeps a missing track in the queue, where the transport steps over it', () => {
    playQueue([item(1)], 0, 'In Rainbows');
    appendToQueue(item(2, { missing: true }));
    appendToQueue(item(3));
    expect(upNext(player())?.id).toBe(3);
    jumpTo(1);
    expect(player().index).toBe(0);
    jumpTo(2);
    expect(player()).toMatchObject({ index: 2, playing: true });
  });
});

describe('closing', () => {
  it('clears the queue and the card', () => {
    playQueue([item(1)], 0, 'Queue');
    closePlayer();
    expect(playerState()).toMatchObject({ player: null, cardOpen: false });
  });

  it('opening Now Playing hides the card until the next queue', () => {
    playQueue([item(1)], 0, 'Queue');
    setNowOpen(true);
    expect(playerState().cardOpen).toBe(false);
    setNowOpen(false);
    expect(playerState().cardOpen).toBe(false);
    playQueue([item(2)], 0, 'Queue');
    expect(playerState().cardOpen).toBe(true);
  });
});

function video(id: number): PlayerItem {
  return item(id, {
    kind: 'video',
    title: `Video ${id}`,
    sub: 'NASA',
    album: undefined,
    fileUrl: `/api/library/videos/${id}/play`,
  });
}

describe('one thing plays at a time', () => {
  it('a video replaces music and music replaces a video', () => {
    playQueue([item(1), item(2)], 1, 'In Rainbows');
    reportPosition(80);
    playQueue([video(10), video(11)], 0, 'NASA');
    expect(player()).toMatchObject({ kind: 'video', index: 0, pos: 0, from: 'NASA' });
    expect(player().queue.map((entry) => entry.kind)).toEqual(['video', 'video']);
    expect(currentItem(player())?.kind).toBe('video');

    playQueue([item(3)], 0, 'Tracks');
    expect(player()).toMatchObject({ kind: 'music', from: 'Tracks' });
    expect(player().queue.every((entry) => entry.kind === 'music')).toBe(true);
  });

  it('adding music while a video plays starts a new music queue', () => {
    playQueue([video(10)], 0, 'NASA');
    appendToQueue(item(1));
    expect(player()).toMatchObject({ kind: 'music', from: 'Queue' });
    expect(player().queue).toHaveLength(1);
  });
});

describe('openCard (Pop out)', () => {
  it('opens the card again, shown once Now Playing is left', () => {
    playQueue([item(1)], 0, 'Home');
    setNowOpen(true);
    expect(playerState().cardOpen).toBe(false);
    openCard();
    expect(playerState().cardOpen).toBe(true);
    setNowOpen(false);
    expect(playerState().cardOpen).toBe(true);
  });

  it('does nothing without a queue', () => {
    openCard();
    expect(playerState().cardOpen).toBe(false);
  });
});
