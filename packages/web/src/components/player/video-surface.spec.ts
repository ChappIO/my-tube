import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type PlaceableMedia,
  type VideoHost,
  pickHost,
  placeVideo,
  registerVideoHost,
  setVideoMedia,
} from './video-surface';

/** A stand-in for the `<video>`: a clock and the calls that would restart it. */
class FakeVideo implements PlaceableMedia {
  parentNode: FakeHost | null = null;
  currentTime = 0;
  paused = false;
  load = vi.fn<() => void>();
  pause = vi.fn<() => void>();
}

/** A stand-in for a host element: `appendChild` moves the node like the DOM does. */
class FakeHost implements VideoHost {
  children: FakeVideo[] = [];
  constructor(readonly name: string) {}
  appendChild(node: PlaceableMedia): unknown {
    if (!(node instanceof FakeVideo)) throw new Error('Only the video moves');
    const video = node;
    if (video.parentNode) {
      video.parentNode.children = video.parentNode.children.filter((child) => child !== video);
    }
    video.parentNode = this;
    this.children.push(video);
    return video;
  }
}

afterEach(() => {
  setVideoMedia(null, null);
});

describe('video surfaces', () => {
  it('prefers the Now Playing frame over the card, the latest among equals', () => {
    const card = new FakeHost('card');
    const frame = new FakeHost('frame');
    const other = new FakeHost('other card');
    expect(pickHost([])).toBeNull();
    expect(pickHost([{ host: card, kind: 'card' }])).toBe(card);
    expect(
      pickHost([
        { host: frame, kind: 'frame' },
        { host: card, kind: 'card' },
      ]),
    ).toBe(frame);
    expect(
      pickHost([
        { host: card, kind: 'card' },
        { host: other, kind: 'card' },
      ]),
    ).toBe(other);
  });

  it('moves one element between surfaces without restarting it', () => {
    const video = new FakeVideo();
    const park = new FakeHost('park');
    setVideoMedia(video, park);
    expect(video.parentNode).toBe(park);

    video.currentTime = 42.5;
    const card = new FakeHost('card');
    const leaveCard = registerVideoHost(card, 'card');
    expect(video.parentNode).toBe(card);

    // Now Playing opens: the frame wins while the card is still mounted.
    const frame = new FakeHost('frame');
    const leaveFrame = registerVideoHost(frame, 'frame');
    expect(video.parentNode).toBe(frame);
    expect(card.children).toEqual([]);
    leaveCard();
    expect(video.parentNode).toBe(frame);

    // Pop out: the frame goes, the card comes back.
    const again = registerVideoHost(new FakeHost('card'), 'card');
    leaveFrame();
    expect(video.parentNode?.name).toBe('card');
    again();
    expect(video.parentNode).toBe(park);

    expect(video.currentTime).toBe(42.5);
    expect(video.load).not.toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('leaves the element alone when it is already in place', () => {
    const video = new FakeVideo();
    const host = new FakeHost('frame');
    const append = vi.spyOn(host, 'appendChild');
    placeVideo(video, host);
    placeVideo(video, host);
    expect(append).toHaveBeenCalledTimes(1);
  });
});
