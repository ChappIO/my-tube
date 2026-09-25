import type { VideoPlayback } from '@mytube/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { videoPlaybackQuery, videoSubtitlesQuery } from '../../api/library';
import { formatLength } from '../../format';
import { type Player, type PlayerItem, jumpTo, seek, togglePlay } from '../../player-state';
import { activeTrackIndex, pickTrack, useVideoPrefs } from '../../video-prefs';
import { cx, focusRing } from '../ui/cx';
import { ControlStrip } from './ControlStrip';
import { UpNextPanel } from './UpNextPanel';
import { VideoFrame } from './VideoFrame';
import { useCaption } from './subtitles';
import { useFullscreen } from './useFullscreen';

export interface NowPlayingVideoProps {
  player: Player;
  item: PlayerItem;
  /** The load error line (an unplayable file), shown under the frame. */
  error: string | null;
  /**
   * Pop out: back to the library screen with the card open, the video playing on in it (after
   * leaving fullscreen).
   */
  onPopOut: () => void;
}

/**
 * Now Playing for a video (frontend skill "Player", "Video"): the player frame, the error line,
 * the control strip, the title block and the shortcut legend, beside Up next at 1180px and up in
 * Fit mode; one column in Theater mode and below 1180px. Fullscreen (the pill, F) is the frame's
 * wrapper: captions, the paused circle and the scrubber stay; the strip does not (it is outside).
 */
export function NowPlayingVideo({ player, item, error, onPopOut }: NowPlayingVideoProps) {
  const prefs = useVideoPrefs();
  const playback = useQuery(videoPlaybackQuery(item.id));
  const tracks = useQuery(videoSubtitlesQuery(item.id));
  const caption = useCaption(item, player.pos);
  const list = tracks.data ?? [];
  const active = activeTrackIndex(list, item.id, prefs);
  const frameRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(frameRef);
  return (
    <div
      className={cx(
        'grid items-start gap-5 wide:gap-7',
        !prefs.theater && 'min-[1180px]:grid-cols-[minmax(0,1fr)_340px]',
      )}
    >
      <div className="grid min-w-0 gap-4">
        <div className="grid gap-2">
          <VideoFrame
            ref={frameRef}
            fullscreen={fullscreen.active}
            title={item.title}
            playing={player.playing}
            pos={player.pos}
            dur={item.dur}
            caption={caption}
            subSize={prefs.subSize}
            subBg={prefs.subBg}
            onToggle={togglePlay}
            seekable={playback.data?.seekable ?? false}
            onSeek={seek}
          />
          {error && (
            <p role="status" className="font-sans text-[13px] text-muted">
              {error}
            </p>
          )}
        </div>
        <ControlStrip
          tracks={list}
          active={active}
          onPick={(index) => pickTrack(list, item.id, index)}
          subSize={prefs.subSize}
          subBg={prefs.subBg}
          speed={prefs.speed}
          theater={prefs.theater}
          onPopOut={onPopOut}
          fullscreen={fullscreen}
        />
        <VideoTitle item={item} playback={playback.data} />
        <ShortcutLegend />
      </div>
      <UpNextPanel player={player} onJump={jumpTo} />
    </div>
  );
}

/** The meta line after the channel: `2 days ago · 48:12 · 1080p · mkv` (what is known). */
export function videoMetaParts(item: PlayerItem, playback: VideoPlayback | undefined): string[] {
  const parts: string[] = [];
  if (item.when) parts.push(item.when);
  if (item.dur > 0) parts.push(formatLength(item.dur));
  if (playback?.height) parts.push(`${playback.height}p`);
  if (item.container) parts.push(item.container);
  return parts;
}

/**
 * The title block: the title (Archivo 800 22 / 1.15, −0.02em) over the meta line (Archivo 13
 * muted) with the channel in `ink` 600 as a link to the channel page.
 */
export function VideoTitle({
  item,
  playback,
}: {
  item: PlayerItem;
  playback: VideoPlayback | undefined;
}) {
  const channel =
    item.channelPageId === undefined ? (
      <span className="font-semibold text-ink">{item.sub}</span>
    ) : (
      <Link
        to="/video/channel/$id"
        params={{ id: String(item.channelPageId) }}
        className={cx('font-semibold text-ink hover:text-red hover:underline', focusRing)}
      >
        {item.sub}
      </Link>
    );
  return (
    <div className="grid gap-[6px]">
      <h1 className="font-sans text-[22px] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">
        {item.title}
      </h1>
      <p className="font-sans text-[13px] text-muted">
        {channel}
        {videoMetaParts(item, playback).map((part) => ` · ${part}`)}
      </p>
    </div>
  );
}

/** The keys Now Playing lists for video, in order. */
export const VIDEO_SHORTCUTS: ReadonlyArray<readonly [key: string, action: string]> = [
  ['Space', 'play'],
  ['← →', '10 s'],
  ['J L', '10 s'],
  ['↑ ↓', 'volume'],
  ['M', 'mute'],
  ['C', 'captions'],
  ['T', 'theater'],
  ['F', 'fullscreen'],
  ['Esc', 'back'],
];

/** The shortcut legend: Space Mono 12 muted, keys in `ink` 700, 16px apart, over a top border. */
export function ShortcutLegend() {
  return (
    <p
      aria-label="Keyboard shortcuts"
      className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 font-mono text-[12px] text-muted"
    >
      {VIDEO_SHORTCUTS.map(([key, action]) => (
        <span key={key}>
          <kbd className="font-mono font-bold text-ink">{key}</kbd> {action}
        </span>
      ))}
    </p>
  );
}
