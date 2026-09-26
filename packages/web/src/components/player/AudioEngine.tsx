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
import { analyserOutput, applyAudioVolume } from './audio-output';
import { resumeMedia } from './resume';
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
 * first play from a user gesture). `VideoEngine` plays video items beside it; the error skip
 * below serves both engines.
 */
export function AudioEngine() {
  const ref = useRef<HTMLAudioElement>(null);
  const { player, load, seekRequest, error, volume, muted } = usePlayerState();
  const item = currentItem(player);
  const src = item?.kind === 'music' ? item.fileUrl : null;
  const playing = player?.playing ?? false;
  // Until the restore's seek is done the element's clock (0) is not the position.
  const seekPending = useRef(false);

  // A new queue, jump, next or prev: (re)load from the start. Setting `src` runs the element's
  // load algorithm even when the URL is the same, so replaying an item restarts it.
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return undefined;
    if (src === null) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return undefined;
    }
    // A restored session's load: loaded paused at the saved position (see `resumeMedia`).
    const { resume } = playerState();
    const resuming = resume !== null && resume.load === load ? resume : null;
    audio.preload = resuming ? 'metadata' : 'auto';
    audio.src = src;
    applyAudioVolume(audio, playerState(), analyserOutput);
    if (!resuming) {
      seekPending.current = false;
      return undefined;
    }
    seekPending.current = true;
    return resumeMedia(audio, {
      seekTo: () => playerState().player?.pos ?? null,
      autoplay: resuming.autoplay,
      current: () => playerState().load === load,
      onReady: () => {
        seekPending.current = false;
      },
    });
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
      // The graph may exist only now (the first play from a click): the level moves to its gain.
      applyAudioVolume(audio, playerState(), analyserOutput);
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

  // The bar's volume and mute: the gain after the visualizer's analyser, or the element's own.
  useEffect(() => {
    if (ref.current) applyAudioVolume(ref.current, { volume, muted }, analyserOutput);
  }, [volume, muted]);

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
      onTimeUpdate={(event) => {
        if (!seekPending.current) reportPosition(event.currentTarget.currentTime);
      }}
      onDurationChange={(event) => reportDuration(event.currentTarget.duration)}
      onWaiting={() => reportBuffering(true)}
      onPlaying={() => {
        reportBuffering(false);
        reportError(null);
      }}
      onCanPlay={() => reportBuffering(false)}
      onEnded={() => next()}
      onPause={(event) => {
        // Our own pause already set the store; this catches pauses from outside the app. The
        // pause that lets go of the element when a video starts is not one.
        if (!event.currentTarget.ended && playerState().player?.kind === 'music') {
          setPlaying(false);
        }
      }}
      onError={(event) => {
        // No source (a closed player) is not an error.
        if (event.currentTarget.getAttribute('src')) reportError(PLAYBACK_ERROR);
      }}
    />
  );
}
