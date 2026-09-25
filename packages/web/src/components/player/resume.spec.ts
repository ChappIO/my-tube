import { afterEach, describe, expect, it } from 'vitest';
import { type PlayerItem, hydratePlayer, playerState, resetPlayer, seek } from '../../player-state';
import { type ResumableMedia, resumeMedia } from './resume';

const item: PlayerItem = {
  kind: 'music',
  id: 1,
  title: 'Red Room',
  sub: 'Hiatus Kaiyote',
  dur: 240,
  artUrl: null,
  fileUrl: '/api/library/tracks/1/file',
};

/** A stand-in media element: metadata arrives on `loadMetadata()`, `play()` as told. */
class FakeMedia extends EventTarget implements ResumableMedia {
  readyState = 0;
  currentTime = 0;
  plays = 0;
  constructor(private readonly allowPlay: boolean) {
    super();
  }
  play(): Promise<void> {
    this.plays += 1;
    return this.allowPlay
      ? Promise.resolve()
      : Promise.reject(new DOMException('no gesture', 'NotAllowedError'));
  }
  loadMetadata(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('loadedmetadata'));
  }
}

afterEach(() => resetPlayer());

function restore(playing: boolean, pos = 31) {
  hydratePlayer({
    kind: 'music',
    queue: [item],
    index: 0,
    pos,
    from: 'Hiatus Kaiyote',
    playing,
    cardOpen: true,
  });
  return playerState().resume!;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('restoring a session in the engine', () => {
  it('hydrates paused at the saved position', () => {
    restore(true);
    expect(playerState().player).toMatchObject({ playing: false, pos: 31 });
    expect(playerState().error).toBeNull();
  });

  it('seeks to the saved position once the metadata is loaded, not before', () => {
    const resume = restore(false);
    const media = new FakeMedia(true);
    let ready = false;
    resumeMedia(media, {
      seekTo: () => playerState().player?.pos ?? null,
      autoplay: resume.autoplay,
      current: () => true,
      onReady: () => {
        ready = true;
      },
    });
    expect(media.currentTime).toBe(0);
    expect(ready).toBe(false);
    media.loadMetadata();
    expect(media.currentTime).toBe(31);
    expect(ready).toBe(true);
    expect(media.plays).toBe(0);
  });

  it('a seek made before the metadata wins', () => {
    restore(false);
    const media = new FakeMedia(true);
    resumeMedia(media, {
      seekTo: () => playerState().player?.pos ?? null,
      autoplay: false,
      current: () => true,
    });
    seek(90);
    media.loadMetadata();
    expect(media.currentTime).toBe(90);
  });

  it('a refused autoplay stays paused without an error', async () => {
    const resume = restore(true);
    const media = new FakeMedia(false);
    resumeMedia(media, { seekTo: () => 31, autoplay: resume.autoplay, current: () => true });
    media.loadMetadata();
    await flush();
    expect(media.plays).toBe(1);
    expect(playerState().player?.playing).toBe(false);
    expect(playerState().error).toBeNull();
  });

  it('an allowed autoplay sets the store playing', async () => {
    const resume = restore(true);
    const media = new FakeMedia(true);
    media.readyState = 1;
    resumeMedia(media, { seekTo: () => 31, autoplay: resume.autoplay, current: () => true });
    await flush();
    expect(media.currentTime).toBe(31);
    expect(playerState().player?.playing).toBe(true);
  });

  it('cancelled (a newer load) does nothing', () => {
    restore(true);
    const media = new FakeMedia(true);
    const cancel = resumeMedia(media, { seekTo: () => 31, autoplay: true, current: () => true });
    cancel();
    media.loadMetadata();
    expect(media.currentTime).toBe(0);
    expect(media.plays).toBe(0);
  });
});
