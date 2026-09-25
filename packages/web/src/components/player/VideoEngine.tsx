import { UNPLAYABLE_VIDEO_MESSAGE, type VideoPlayback } from '@mytube/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { videoPlayUrl, videoPlaybackQuery } from '../../api/library';
import {
  applyVolume,
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
import { useVideoPrefs } from '../../video-prefs';
import { PLAYBACK_ERROR } from './AudioEngine';
import { resumeMedia } from './resume';
import { setVideoMedia } from './video-surface';

/** What the element plays for one load of one item. */
interface VideoSource {
  id: number;
  /** The `load` it belongs to: a source of an earlier load is stale. */
  load: number;
  url: string;
  poster: string | null;
  /** Seconds before the source's start (a remux reloaded with `?t=`); 0 for a direct file. */
  offset: number;
  /** A restored session's load: paused at the saved position, one play attempt (`resumeMedia`). */
  resume?: { autoplay: boolean };
}

/**
 * A pause the element reports this soon after a new source is the load, not the viewer (the
 * browser may pause the old source while the new one loads).
 */
const SOURCE_CHANGE_GRACE_MS = 500;

function createVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  video.className = 'block size-full object-contain';
  return video;
}

/** Whether the store's current item is a video (the other engine owns music). */
function videoPlays(): boolean {
  return playerState().player?.kind === 'video';
}

/**
 * The one `<video>` element of the app (frontend skill "Player", "Video"), created once and
 * driven by the player store like `AudioEngine`. It is never rendered by React: surfaces (the
 * floating card, Now Playing's frame) register an empty host and the element moves between them
 * (`video-surface.ts`), or into the hidden park below when none is mounted, so switching
 * surfaces never restarts playback.
 *
 * A new `load` asks `/playback` how the video plays: `direct` sets `/play` (a redirect to the
 * file) and seeks natively; `remux` sets `/play` and seeks by reloading `/play?t=<s>`, keeping
 * the reported position continuous (`offset + currentTime`); `unsupported` shows the API's
 * message as the error line and the queue moves on after 2 s (the skip lives in `AudioEngine`,
 * which serves both engines). `playbackRate` follows the speed setting.
 */
export function VideoEngine() {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const parkRef = useRef<HTMLDivElement>(null);
  const { player, load, seekRequest, volume, muted } = usePlayerState();
  const { speed } = useVideoPrefs();
  const item = currentItem(player);
  const id = item?.kind === 'video' ? item.id : null;
  const poster = item?.kind === 'video' ? item.artUrl : null;
  const playing = player?.playing ?? false;

  const [loaded, setLoaded] = useState<VideoSource | null>(null);
  // Only the current load's source plays; anything older (or music) drops the element's source.
  const source = loaded && loaded.id === id && loaded.load === load ? loaded : null;
  const sourceRef = useRef<VideoSource | null>(null);
  const playbackRef = useRef<VideoPlayback | null>(null);
  const offsetRef = useRef(0);
  const changedAt = useRef(0);
  const speedRef = useRef(speed);
  // Until a restore's seek is done the element's clock (0) is not the position.
  const seekPending = useRef(false);

  // Create the element, report its events to the store while a video is the current item, and
  // hand it to the surfaces with the park as the fallback.
  useLayoutEffect(() => {
    const video = createVideo();
    videoRef.current = video;
    const ours = () => videoPlays() && video.getAttribute('src') !== null;
    const handlers: Array<[keyof HTMLMediaElementEventMap, () => void]> = [
      [
        'timeupdate',
        () => {
          if (ours() && !seekPending.current) {
            reportPosition(offsetRef.current + video.currentTime);
          }
        },
      ],
      [
        'durationchange',
        () => {
          // A remux streams without a length; its duration comes from `/playback`.
          if (ours() && playbackRef.current?.seekable) reportDuration(video.duration);
        },
      ],
      ['waiting', () => ours() && reportBuffering(true)],
      ['canplay', () => ours() && reportBuffering(false)],
      [
        'playing',
        () => {
          if (!ours()) return;
          reportBuffering(false);
          reportError(null);
        },
      ],
      ['ended', () => ours() && next()],
      [
        'pause',
        () => {
          // Our own pause already set the store; this catches pauses from outside the app.
          if (!ours() || video.ended) return;
          if (performance.now() - changedAt.current < SOURCE_CHANGE_GRACE_MS) return;
          setPlaying(false);
        },
      ],
      ['error', () => ours() && reportError(PLAYBACK_ERROR)],
    ];
    for (const [type, handler] of handlers) video.addEventListener(type, handler);
    setVideoMedia(video, parkRef.current);
    return () => {
      for (const [type, handler] of handlers) video.removeEventListener(type, handler);
      video.pause();
      video.removeAttribute('src');
      setVideoMedia(null, null);
      video.remove();
      videoRef.current = null;
    };
  }, []);

  // A new queue, jump, next or prev: ask how the video plays, then load it from the start.
  useEffect(() => {
    playbackRef.current = null;
    if (id === null) return undefined;
    let cancelled = false;
    queryClient.fetchQuery(videoPlaybackQuery(id)).then(
      (playback) => {
        if (cancelled) return;
        playbackRef.current = playback;
        if (playback.mode === 'unsupported') {
          // No source: the element shows the thumbnail under the error line.
          if (videoRef.current) videoRef.current.poster = poster ?? '';
          reportError(UNPLAYABLE_VIDEO_MESSAGE);
          return;
        }
        if (playback.durationSeconds) reportDuration(playback.durationSeconds);
        // A restored session starts at the saved position: a remux streams from there (`?t=`),
        // a direct file seeks once its metadata is in.
        const state = playerState();
        const resume =
          state.resume?.load === load ? { autoplay: state.resume.autoplay } : undefined;
        const pos = resume ? (state.player?.pos ?? 0) : 0;
        const offset = resume && !playback.seekable && pos > 0 ? pos : 0;
        setLoaded({ id, load, url: videoPlayUrl(id, offset), poster, offset, resume });
      },
      () => {
        if (!cancelled) reportError(PLAYBACK_ERROR);
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is the trigger (it bumps when the same video has to start over); the poster
    // belongs to the item and rides along.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [load, id, queryClient]);

  // Set (or drop) the element's source. A new object always reloads, so a replay restarts.
  useEffect(() => {
    sourceRef.current = source;
    const video = videoRef.current;
    seekPending.current = false;
    if (!video) return undefined;
    if (source === null) {
      if (video.getAttribute('src') !== null) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      return undefined;
    }
    offsetRef.current = source.offset;
    changedAt.current = performance.now();
    video.poster = source.poster ?? '';
    video.preload = source.resume ? 'metadata' : 'auto';
    video.src = source.url;
    applyVolume(video, playerState());
    // The load resets the rate to the default one.
    video.defaultPlaybackRate = speedRef.current;
    video.playbackRate = speedRef.current;
    if (!source.resume) return undefined;
    // A direct file seeks to the saved position; a remux already starts there.
    seekPending.current = source.offset === 0;
    return resumeMedia(video, {
      seekTo: () => (source.offset > 0 ? null : (playerState().player?.pos ?? null)),
      autoplay: source.resume.autoplay,
      current: () => sourceRef.current === source,
      onReady: () => {
        seekPending.current = false;
      },
    });
  }, [source]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || source === null) return;
    if (playing && video.paused) {
      reportBuffering(video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
      video.play().catch((reason: unknown) => {
        // A newer load interrupted this play (AbortError): the next effect plays again.
        if (reason instanceof DOMException && reason.name === 'NotAllowedError') setPlaying(false);
      });
    } else if (!playing && !video.paused) {
      video.pause();
    }
  }, [playing, source]);

  // Seeks the store asked for: natively for a direct file, by reloading from there for a remux.
  const firstSeek = useRef(seekRequest);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || seekRequest === firstSeek.current) return;
    const playback = playbackRef.current;
    const current = sourceRef.current;
    if (!playback || !current || playback.mode === 'unsupported') return;
    const pos = playerState().player?.pos ?? 0;
    if (!Number.isFinite(pos)) return;
    if (playback.seekable) video.currentTime = pos;
    else {
      setLoaded({ ...current, url: videoPlayUrl(current.id, pos), offset: pos, resume: undefined });
    }
  }, [seekRequest]);

  // The bar's volume and mute (shared with the audio engine).
  useEffect(() => {
    if (videoRef.current) applyVolume(videoRef.current, { volume, muted });
  }, [volume, muted]);

  useEffect(() => {
    speedRef.current = speed;
    const video = videoRef.current;
    if (!video) return;
    video.defaultPlaybackRate = speed;
    video.playbackRate = speed;
  }, [speed]);

  return <div ref={parkRef} hidden aria-hidden="true" />;
}
