import type { TrackListItem } from '@mytube/shared';
import { useCallback, useRef, useState } from 'react';
import { trackStreamUrl } from '../../api/library';
import { Artwork } from '../media';
import { PlayCircle } from './PreviewPlayer';

/**
 * Whether this browser can play an audio type (`audio/mp4`, `audio/ogg; codecs=opus`,
 * `audio/flac`): `canPlayType` answers `''` for no.
 */
export function canPlayAudio(mimeType: string | null): boolean {
  if (!mimeType || typeof document === 'undefined') return false;
  return document.createElement('audio').canPlayType(mimeType) !== '';
}

export interface PreviewAudioPlayerProps {
  /** The track, or undefined while it loads (the black area alone). */
  track: TrackListItem | undefined;
  /** Whether the file plays here (`canPlayAudio`). */
  playable: boolean;
  /** The browser failed to decode the file after all. */
  onUnplayable?: () => void;
}

/**
 * The Preview player area for a track: the same 16/9 black area as for videos, with the cover
 * art (square, centred) as the visual and the 72px play circle until playback starts; then the
 * native `<audio>` controls along the bottom. The file streams with HTTP Range requests and
 * pauses when Preview closes. A format the browser cannot play shows the cover alone.
 */
export function PreviewAudioPlayer({ track, playable, onUnplayable }: PreviewAudioPlayerProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const [started, setStarted] = useState(false);

  const attach = useCallback((element: HTMLAudioElement | null) => {
    ref.current = element;
    return () => {
      element?.pause();
      ref.current = null;
    };
  }, []);

  return (
    <div className="relative aspect-video w-full bg-player">
      {track && (
        <div className="absolute top-3 bottom-[72px] left-1/2 wide:top-6 wide:bottom-20 aspect-square -translate-x-1/2">
          <Artwork src={track.coverUrl ?? undefined} seed={track.title} fill />
        </div>
      )}
      {track && playable && (
        <audio
          ref={attach}
          src={trackStreamUrl(track.id)}
          preload="metadata"
          controls={started}
          onPlay={() => setStarted(true)}
          onError={onUnplayable}
          className="absolute inset-x-4 bottom-4 w-[calc(100%-32px)]"
        />
      )}
      {track && playable && !started && (
        <PlayCircle
          label={`Play ${track.title}`}
          onPlay={() => {
            setStarted(true);
            void ref.current?.play();
          }}
        />
      )}
    </div>
  );
}
