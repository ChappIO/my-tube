import { playerState, setPlaying } from '../../player-state';

/** What `resumeMedia` needs of a media element (a stand-in in tests). */
export type ResumableMedia = Pick<
  HTMLMediaElement,
  'readyState' | 'currentTime' | 'play' | 'addEventListener' | 'removeEventListener'
>;

export interface ResumeOptions {
  /** Where to seek once the metadata is known (read then, so a seek made meanwhile wins); null to stay. */
  seekTo: () => number | null;
  /** It was playing when saved: try `play()` once. */
  autoplay: boolean;
  /** Whether this restore is still the current load (a newer load cancels the play). */
  current: () => boolean;
  /** The seek is done: the engine reports the element's clock again. */
  onReady?: () => void;
}

/**
 * Picks up a restored session on a freshly set source (frontend skill "Player", "Session"): once
 * the metadata is loaded, seek to the saved position; then, when it was playing, try `play()`
 * once. Browsers usually refuse a play without a gesture after a reload: the refusal is quiet,
 * the store stays paused and the bar shows the play button, without an error line. A play that
 * is allowed sets the store playing. Returns the cancel function.
 */
export function resumeMedia(media: ResumableMedia, options: ResumeOptions): () => void {
  let settled = false;
  const ready = () => {
    media.removeEventListener('loadedmetadata', ready);
    if (settled) return;
    settled = true;
    const pos = options.seekTo();
    if (pos !== null && Number.isFinite(pos) && pos > 0) media.currentTime = pos;
    options.onReady?.();
    if (!options.autoplay || playerState().player?.playing) return;
    media.play().then(
      () => {
        if (options.current()) setPlaying(true);
      },
      () => {
        // Refused without a gesture (or interrupted by a newer load): stay paused, no error.
      },
    );
  };
  if (media.readyState >= 1) ready();
  else media.addEventListener('loadedmetadata', ready);
  return () => {
    settled = true;
    media.removeEventListener('loadedmetadata', ready);
  };
}
