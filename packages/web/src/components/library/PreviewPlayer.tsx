import type { VideoListItem } from '@mytube/shared';
import { useCallback, useRef, useState } from 'react';
import { videoStreamUrl } from '../../api/library';
import { PlayIcon } from '../icons';
import { cx, focusRing } from '../ui/cx';

/**
 * Whether this browser can play a container (`video/mp4`, `video/x-matroska`): `canPlayType`
 * answers `''` for no, `maybe` or `probably` for yes. mkv is a no in most browsers.
 */
export function canPlayInBrowser(mimeType: string | null): boolean {
  if (!mimeType || typeof document === 'undefined') return false;
  return document.createElement('video').canPlayType(mimeType) !== '';
}

export interface PreviewPlayerProps {
  /** The video, or undefined while it loads (the black area alone). */
  video: VideoListItem | undefined;
  /** Whether the file's container plays here (`canPlayInBrowser`). */
  playable: boolean;
  /**
   * The browser failed to decode the file after all (`canPlayType` only guesses: Chromium says
   * `maybe` for mkv but cannot play every codec in it).
   */
  onUnplayable?: () => void;
}

/**
 * The Preview player area: 16/9 black with the thumbnail as poster and the
 * 72px translucent white play circle until playback starts; then the native controls. The file
 * streams with HTTP Range requests (`preload="metadata"` reads only the header until play). A
 * container the browser cannot play shows the poster alone. Playback pauses when Preview closes.
 */
export function PreviewPlayer({ video, playable, onUnplayable }: PreviewPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const poster = video?.thumbnailUrl ?? undefined;

  // Pause on close: the element goes with the modal, but a playing element can keep its audio
  // for a moment while React tears down. A ref callback's cleanup runs when it unmounts.
  const attach = useCallback((element: HTMLVideoElement | null) => {
    ref.current = element;
    return () => {
      element?.pause();
      ref.current = null;
    };
  }, []);

  return (
    <div className="relative aspect-video w-full bg-player">
      {video && playable ? (
        <video
          ref={attach}
          src={videoStreamUrl(video.id)}
          poster={poster}
          preload="metadata"
          playsInline
          controls={started}
          onPlay={() => setStarted(true)}
          onError={onUnplayable}
          className="absolute inset-0 size-full"
        />
      ) : (
        poster && (
          <img
            src={poster}
            alt=""
            draggable={false}
            className="absolute inset-0 size-full object-contain"
          />
        )
      )}
      {video && playable && !started && (
        <PlayCircle
          label={`Play ${video.title}`}
          onPlay={() => {
            setStarted(true);
            void ref.current?.play();
          }}
        />
      )}
    </div>
  );
}

/**
 * The 72px translucent play circle over the player area until playback starts.
 */
export function PlayCircle({ label, onPlay }: { label: string; onPlay: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPlay}
      className={cx(
        'absolute top-1/2 left-1/2 grid size-[72px] -translate-1/2 cursor-pointer place-items-center rounded-full bg-player-glyph text-white',
        focusRing,
      )}
    >
      <PlayIcon size={28} className="ml-0.5" />
    </button>
  );
}
