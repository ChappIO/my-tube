import { useEffect, useRef } from 'react';
import {
  ERROR_SKIP_MS,
  currentItem,
  next,
  playerState,
  reportBuffering,
  reportDuration,
  reportError,
  reportPosition,
  setPlaying,
  usePlayerState,
} from '../../player-state';
import { connectAnalyser } from './useAnalyser';

/** The bar's error line when a file does not load or decode. */
export const PLAYBACK_ERROR = 'This file could not be played. Skipping.';

/**
 * The one `<audio>` element of the app, mounted once in the shell so playback survives
 * navigation. It follows the player store: a new `load` sets the source (the track's Range
 * stream), `playing` plays or pauses, a new `seekRequest` moves `currentTime`. It reports back
 * the position (`timeupdate`), the real duration, buffering, errors (the store's error line; the
 * next item after 2 s) and the end of an item (auto-advance through `next`). A pause from outside
 * the app (a headset unplugged) pauses the store too.
 *
 * Every play also calls `connectAnalyser` (the visualizer's `AnalyserNode`, built once on the
 * first play from a user gesture); slice C adds a `<video>` engine beside it for `kind: 'video'`.
 */
export function AudioEngine() {
  const ref = useRef<HTMLAudioElement>(null);
  const { player, load, seekRequest, error } = usePlayerState();
  const item = currentItem(player);
  const src = item?.kind === 'music' ? item.fileUrl : null;
  const playing = player?.playing ?? false;

  // A new queue, jump, next or prev: (re)load from the start. Setting `src` runs the element's
  // load algorithm even when the URL is the same, so replaying an item restarts it.
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    if (src === null) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    audio.src = src;
    // `load` is the trigger: it bumps when the same URL has to start over.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [load, src]);

  useEffect(() => {
    const audio = ref.current;
    if (!audio || src === null) return;
    if (playing && audio.paused) {
      reportBuffering(audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
      // The visualizer's analyser: built on the first play from a click, resumed on every play.
      connectAnalyser(audio);
      audio.play().catch((reason: unknown) => {
        // A newer load interrupted this play (AbortError): the next effect plays again.
        if (reason instanceof DOMException && reason.name === 'NotAllowedError') setPlaying(false);
      });
    } else if (!playing && !audio.paused) {
      audio.pause();
    }
    // After every load the element is paused again, so a new load plays anew.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [playing, load, src]);

  // Seeks the store asked for (the scrubber, ±10 s, prev's restart, play after the end).
  const firstSeek = useRef(seekRequest);
  useEffect(() => {
    const audio = ref.current;
    if (!audio || seekRequest === firstSeek.current) return;
    const pos = playerState().player?.pos ?? 0;
    if (Number.isFinite(pos)) audio.currentTime = pos;
  }, [seekRequest]);

  // An item that failed shows the error line, then the queue moves on.
  useEffect(() => {
    if (error === null) return undefined;
    const timer = window.setTimeout(next, ERROR_SKIP_MS);
    return () => window.clearTimeout(timer);
    // A new item cancels the pending skip of the one that failed.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [error, load]);

  return (
    <audio
      ref={ref}
      preload="auto"
      aria-hidden="true"
      className="hidden"
      onTimeUpdate={(event) => reportPosition(event.currentTarget.currentTime)}
      onDurationChange={(event) => reportDuration(event.currentTarget.duration)}
      onWaiting={() => reportBuffering(true)}
      onPlaying={() => {
        reportBuffering(false);
        reportError(null);
      }}
      onCanPlay={() => reportBuffering(false)}
      onEnded={() => next()}
      onPause={(event) => {
        // Our own pause already set the store; this catches pauses from outside the app.
        if (!event.currentTarget.ended) setPlaying(false);
      }}
      onError={(event) => {
        // No source (a closed player) is not an error.
        if (event.currentTarget.getAttribute('src')) reportError(PLAYBACK_ERROR);
      }}
    />
  );
}
