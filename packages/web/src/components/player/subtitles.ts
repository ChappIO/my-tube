import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { subtitleTextQuery, videoSubtitlesQuery } from '../../api/library';
import type { PlayerItem } from '../../player-state';
import { type SubtitleSize, activeTrackIndex, useVideoPrefs } from '../../video-prefs';
import { cx } from '../ui/cx';

/*
 * Captions as a DOM layer instead of native text tracks, so the size and background settings
 * apply (frontend skill "Player", "Video"): the WebVTT of the chosen track is parsed once and the
 * cue under the position is drawn over the video.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/;

function seconds(stamp: string): number | null {
  const match = TIME.exec(stamp);
  if (!match) return null;
  const [, hours, minutes, secs, millis] = match;
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(secs) + Number(millis) / 1000;
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&quot;': '"',
  '&#39;': "'",
};

/** A cue's text without markup (`<i>`, `<c.colour>`, timestamps) and with entities decoded. */
function plainText(lines: readonly string[]): string {
  return lines
    .join('\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|nbsp|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .trim();
}

/** The cues of a WebVTT file in time order (the header, NOTE, STYLE and REGION blocks skipped). */
export function parseVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timing = lines.findIndex((line) => line.includes('-->'));
    if (timing === -1) continue;
    const [from, to] = lines[timing]!.split('-->');
    const start = seconds(from ?? '');
    const end = seconds(to ?? '');
    const body = plainText(lines.slice(timing + 1));
    if (start === null || end === null || end <= start || body === '') continue;
    cues.push({ start, end, text: body });
  }
  return cues.toSorted((a, b) => a.start - b.start);
}

/** The text on screen at `pos`: every cue that covers it, one per line; null for none. */
export function activeCue(cues: readonly Cue[], pos: number): string | null {
  const texts: string[] = [];
  for (const cue of cues) {
    if (cue.start > pos) break;
    if (pos < cue.end && !texts.includes(cue.text)) texts.push(cue.text);
  }
  return texts.length === 0 ? null : texts.join('\n');
}

/** Size S/M/L: 14/19/26px in Now Playing's frame. */
export const SUBTITLE_FONT_SIZES: Readonly<Record<SubtitleSize, string>> = {
  S: 'text-[14px]',
  M: 'text-[19px]',
  L: 'text-[26px]',
};

/**
 * The caption box's classes. `frame`: Archivo 500 at the chosen size, line height 1.35, padding
 * 4px 10px, radius 6, on black at .72 or, with the background off, transparent with a text
 * shadow. `card`: the floating card's caption line, Archivo 500 11 on black at .7, 2px 6px,
 * radius 4 (the card is too small for the style settings).
 */
export function subtitleClasses(
  variant: 'frame' | 'card',
  size: SubtitleSize,
  background: boolean,
): string {
  if (variant === 'card') {
    return 'rounded-badge bg-player-caption px-[6px] py-[2px] font-sans text-[11px] font-medium text-white';
  }
  return cx(
    'rounded-chip px-[10px] py-1 font-sans leading-[1.35] font-medium text-white',
    SUBTITLE_FONT_SIZES[size],
    background ? 'bg-player-subtitle' : 'bg-transparent text-shadow-subtitle',
  );
}

/**
 * The caption on screen for a video item at `pos`: the chosen track (`activeTrackIndex`) loaded
 * and parsed once, then the cue under the position. Null with captions off, before the track
 * loaded, between cues and for music.
 */
export function useCaption(item: PlayerItem | null, pos: number): string | null {
  const prefs = useVideoPrefs();
  const videoId = item?.kind === 'video' ? item.id : 0;
  const tracks = useQuery({ ...videoSubtitlesQuery(videoId), enabled: videoId > 0 });
  const list = tracks.data ?? [];
  const track = list[activeTrackIndex(list, videoId, prefs)];
  const text = useQuery({ ...subtitleTextQuery(track?.url ?? ''), enabled: track !== undefined });
  const cues = useMemo(() => (text.data ? parseVtt(text.data) : []), [text.data]);
  if (!track) return null;
  return activeCue(cues, pos);
}
