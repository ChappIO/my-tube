import type { Ref } from 'react';
import type { SubtitleSize } from '../../video-prefs';
import { PlayIcon } from '../icons';
import { cx, focusRingNone } from '../ui/cx';
import { FrameScrubber } from './FrameScrubber';
import { VideoSurface } from './VideoSurface';
import { subtitleClasses } from './subtitles';

export interface VideoFrameProps {
  title: string;
  playing: boolean;
  pos: number;
  dur: number;
  /** The caption on screen, or null. */
  caption: string | null;
  subSize: SubtitleSize;
  subBg: boolean;
  onToggle: () => void;
  /** The file seeks natively (direct): the scrubber seeks live while dragging. */
  seekable: boolean;
  onSeek: (pos: number) => void;
  /** The frame's wrapper: the element `useFullscreen` makes fullscreen. */
  ref?: Ref<HTMLDivElement>;
  /** The wrapper is fullscreen: it fills the screen, square-cornered, the video contained on black. */
  fullscreen?: boolean;
}

/**
 * Now Playing's player frame: 16/9, radius 18, `player` black, the video (`object-fit: contain`)
 * as its surface. A click anywhere plays or pauses; paused, an 84px translucent circle with a
 * blurred backdrop and the 36px play glyph sits in the middle. Captions are a DOM layer 28px
 * above the bottom (`SubtitleLayer`); the 4px progress line along the bottom edge is a scrubber
 * (`FrameScrubber`). Fullscreen is this wrapper, not the `<video>`, so all of that stays on
 * screen.
 */
export function VideoFrame({
  title,
  playing,
  pos,
  dur,
  caption,
  subSize,
  subBg,
  onToggle,
  seekable,
  onSeek,
  ref,
  fullscreen = false,
}: VideoFrameProps) {
  return (
    <div
      ref={ref}
      className={cx(
        'relative w-full overflow-hidden bg-player',
        fullscreen ? 'h-full rounded-none' : 'aspect-video rounded-modal',
      )}
    >
      <VideoSurface kind="frame" />
      <SubtitleLayer text={caption} variant="frame" size={subSize} background={subBg} />
      <button
        type="button"
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        onClick={onToggle}
        className={cx('absolute inset-0 z-[1] cursor-pointer', focusRingNone)}
      >
        {!playing && (
          <span className="absolute top-1/2 left-1/2 grid size-[84px] -translate-1/2 place-items-center rounded-full bg-player-frame-glyph text-white backdrop-blur-[6px]">
            <PlayIcon size={36} />
          </span>
        )}
      </button>
      <FrameScrubber pos={pos} dur={dur} live={seekable} onSeek={onSeek} />
    </div>
  );
}

/**
 * The caption on the video, centred. `frame`: 28px above the bottom, at most 70% wide, in the
 * chosen size and background. `card`: the floating card's one line, 64px above the bottom (over
 * the title fade). Nothing without text. Not a native text track, so the style settings apply.
 */
export function SubtitleLayer({
  text,
  variant,
  size = 'M',
  background = true,
}: {
  text: string | null;
  variant: 'frame' | 'card';
  size?: SubtitleSize;
  background?: boolean;
}) {
  if (!text) return null;
  return (
    <div
      aria-live="off"
      className={cx(
        'pointer-events-none absolute inset-x-0 z-[1] flex justify-center px-3',
        variant === 'frame' ? 'bottom-7' : 'bottom-16',
      )}
    >
      <p
        className={cx(
          'text-center whitespace-pre-line',
          variant === 'frame' ? 'max-w-[70%]' : 'max-w-full',
          subtitleClasses(variant, size, background),
        )}
      >
        {text}
      </p>
    </div>
  );
}
