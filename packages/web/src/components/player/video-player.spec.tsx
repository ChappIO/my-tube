import type { SubtitleTrack, VideoPlayback } from '@mytube/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Player, PlayerItem } from '../../player-state';
import { CaptionsMenu, SpeedButton, captionsLabel, togglePopover } from './ControlStrip';
import { ShortcutLegend, VIDEO_SHORTCUTS, videoMetaParts } from './NowPlayingVideo';
import { UpNextPanel, upNextLabel, upNextSub } from './UpNextPanel';
import { SubtitleLayer, VideoFrame } from './VideoFrame';
import { activeCue, parseVtt, subtitleClasses } from './subtitles';
import { ControlPill } from './ControlStrip';
import { frameScrubberClasses } from './FrameScrubber';
import { modalityOf } from './useInputModality';
import { shortcutFor } from './useKeyboardShortcuts';

function video(id: number, extra: Partial<PlayerItem> = {}): PlayerItem {
  return {
    kind: 'video',
    id,
    title: `Video ${id}`,
    sub: 'NASA',
    when: '2 days ago',
    dur: 2892,
    artUrl: `/api/artwork/video/${id}`,
    fileUrl: `/api/library/videos/${id}/play`,
    channelPageId: 5,
    container: 'mkv',
    ...extra,
  };
}

const tracks: SubtitleTrack[] = [
  { lang: 'en', label: 'English', kind: 'sidecar', url: '/api/library/videos/1/subtitles/0.vtt' },
  { lang: 'en', label: 'English', kind: 'embedded', url: '/api/library/videos/1/subtitles/1.vtt' },
];

describe('WebVTT', () => {
  const vtt = [
    'WEBVTT',
    'Kind: captions',
    '',
    'NOTE a comment --> not a cue',
    'still the note',
    '',
    '1',
    '00:00:01.000 --> 00:00:03.500 align:start position:0%',
    '<c.colorE5E5E5>We have</c> <i>liftoff</i>',
    '&amp; cheers',
    '',
    '00:02.000 --> 00:04.000',
    'Overlapping',
    '',
    '01:00:00,000 --> 01:00:02,000',
    'An hour in',
  ].join('\r\n');

  it('parses cues without markup, in time order', () => {
    expect(parseVtt(vtt)).toEqual([
      { start: 1, end: 3.5, text: 'We have liftoff\n& cheers' },
      { start: 2, end: 4, text: 'Overlapping' },
      { start: 3600, end: 3602, text: 'An hour in' },
    ]);
  });

  it('finds the text on screen at a position', () => {
    const cues = parseVtt(vtt);
    expect(activeCue(cues, 0.5)).toBeNull();
    expect(activeCue(cues, 1)).toBe('We have liftoff\n& cheers');
    expect(activeCue(cues, 2.5)).toBe('We have liftoff\n& cheers\nOverlapping');
    expect(activeCue(cues, 3.9)).toBe('Overlapping');
    expect(activeCue(cues, 4)).toBeNull();
    expect(activeCue(cues, 3601)).toBe('An hour in');
  });
});

describe('subtitle style', () => {
  it('sizes S/M/L 14/19/26 with the background or a text shadow', () => {
    expect(subtitleClasses('frame', 'S', true)).toContain('text-[14px]');
    expect(subtitleClasses('frame', 'M', true)).toContain('text-[19px]');
    expect(subtitleClasses('frame', 'L', true)).toContain('text-[26px]');
    expect(subtitleClasses('frame', 'M', true)).toContain('bg-player-subtitle');
    expect(subtitleClasses('frame', 'M', true)).not.toContain('text-shadow-subtitle');
    const plain = subtitleClasses('frame', 'M', false);
    expect(plain).toContain('bg-transparent');
    expect(plain).toContain('text-shadow-subtitle');
    // The card's line ignores the settings.
    expect(subtitleClasses('card', 'L', false)).toContain('text-[11px]');
    expect(subtitleClasses('card', 'L', false)).toContain('bg-player-caption');
  });

  it('draws the caption layer only with text', () => {
    expect(renderToStaticMarkup(<SubtitleLayer text={null} variant="frame" />)).toBe('');
    const html = renderToStaticMarkup(
      <SubtitleLayer text="Hello" variant="frame" size="L" background={false} />,
    );
    expect(html).toContain('bottom-7');
    expect(html).toContain('max-w-[70%]');
    expect(html).toContain('text-[26px]');
    expect(html).toContain('>Hello</p>');
  });
});

describe('control strip', () => {
  it('keeps one popover open at a time', () => {
    expect(togglePopover(null, 'captions')).toBe('captions');
    expect(togglePopover('captions', 'style')).toBe('style');
    expect(togglePopover('style', 'captions')).toBe('captions');
    expect(togglePopover('style', 'style')).toBeNull();
  });

  it('labels the CC button and lists Off and each track with its hint', () => {
    expect(captionsLabel(tracks, -1)).toBe('Off');
    expect(captionsLabel(tracks, 1)).toBe('English');
    const html = renderToStaticMarkup(
      <CaptionsMenu
        tracks={tracks}
        active={1}
        open
        onToggle={() => undefined}
        onClose={() => undefined}
        onPick={() => undefined}
      />,
    );
    expect(html).toContain('aria-expanded="true"');
    // Captions on: the button is filled ink.
    expect(html).toMatch(/<button[^>]*bg-ink text-bg[^>]*aria-label="Captions: English"/);
    const items = [...html.matchAll(/role="menuitemradio" aria-checked="(true|false)"/g)];
    expect(items.map((match) => match[1])).toEqual(['false', 'false', 'true']);
    expect(html).toContain('>sidecar</span>');
    expect(html).toContain('>embedded</span>');
  });

  it('shows the speed in Space Mono', () => {
    const html = renderToStaticMarkup(<SpeedButton speed={1.25} />);
    expect(html).toContain('font-mono');
    expect(html).toContain('>1.25×</button>');
  });
});

describe('Now Playing video', () => {
  it('draws the paused frame with the play circle and the progress line', () => {
    const html = renderToStaticMarkup(
      <VideoFrame
        title="Video 1"
        playing={false}
        pos={723}
        dur={2892}
        caption={null}
        subSize="M"
        subBg
        onToggle={() => undefined}
        seekable={false}
        onSeek={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Play Video 1"');
    expect(html).toContain('role="slider"');
    expect(html).toContain('size-[84px]');
    expect(html).toContain('width:25%');
  });

  it('writes the meta line from what is known', () => {
    const playback: VideoPlayback = {
      mode: 'remux',
      mimeType: 'video/mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1920,
      height: 1080,
      durationSeconds: 2892,
      seekable: false,
    };
    expect(videoMetaParts(video(1), playback)).toEqual(['2 days ago', '48:12', '1080p', 'mkv']);
    expect(videoMetaParts(video(1, { when: undefined, dur: 0 }), undefined)).toEqual(['mkv']);
  });

  it('lists the shortcuts, volume, M, C and T included', () => {
    const html = renderToStaticMarkup(<ShortcutLegend />);
    expect(VIDEO_SHORTCUTS.map(([key]) => key)).toEqual([
      'Space',
      '← →',
      'J L',
      '↑ ↓',
      'M',
      'C',
      'T',
      'Esc',
    ]);
    expect(html).toContain('<kbd class="font-mono font-bold text-ink">C</kbd> captions');
  });

  it('shows Up next with the position, the current row in red', () => {
    const player: Player = {
      kind: 'video',
      queue: [video(1), video(2), video(3, { when: undefined })],
      index: 1,
      playing: true,
      pos: 10,
      from: 'NASA',
    };
    expect(upNextLabel(player)).toBe('2 of 3');
    expect(upNextSub(player.queue[0]!)).toBe('NASA · 2 days ago');
    expect(upNextSub(player.queue[2]!)).toBe('NASA');
    const html = renderToStaticMarkup(<UpNextPanel player={player} onJump={() => undefined} />);
    expect(html).toContain('>2 of 3</span>');
    expect(html).toMatch(/aria-current="true"[^]*?text-red">Video 2</);
    expect(html).toContain('>48:12</span>');
  });
});

describe('keyboard', () => {
  it('maps C to captions and T to theater', () => {
    expect(shortcutFor('c')).toBe('captions');
    expect(shortcutFor('C')).toBe('captions');
    expect(shortcutFor('t')).toBe('theater');
    expect(shortcutFor('T')).toBe('theater');
    expect(shortcutFor('x')).toBeNull();
  });
});

describe('focus rings', () => {
  /** The focus utilities in a class list. */
  const rings = (html: string) => [...html.matchAll(/focus-ring[a-z-]*/g)].map((match) => match[0]);

  it('the frame and its scrubber draw no ring', () => {
    const html = renderToStaticMarkup(
      <VideoFrame
        title="Video 1"
        playing
        pos={0}
        dur={60}
        caption={null}
        subSize="M"
        subBg
        onToggle={() => undefined}
        seekable
        onSeek={() => undefined}
      />,
    );
    expect(new Set(rings(html))).toEqual(new Set(['focus-ring-none']));
    expect(rings(frameScrubberClasses(false).zone)).toEqual(['focus-ring-none']);
  });

  it('control pills and menu items ring for the keyboard only', () => {
    expect(rings(renderToStaticMarkup(<ControlPill>Pop out</ControlPill>))).toEqual([
      'focus-ring-visible',
    ]);
    const menu = renderToStaticMarkup(
      <CaptionsMenu
        tracks={tracks}
        active={-1}
        open
        onToggle={() => undefined}
        onClose={() => undefined}
        onPick={() => undefined}
      />,
    );
    expect(new Set(rings(menu))).toEqual(
      new Set(['focus-ring-visible', 'focus-ring-visible-inset']),
    );
  });

  it('tracks the input modality from presses and Tab only', () => {
    expect(modalityOf({ type: 'pointerdown' })).toBe('pointer');
    expect(modalityOf({ type: 'keydown', key: 'Tab' })).toBe('keyboard');
    expect(modalityOf({ type: 'keydown', key: ' ' })).toBeNull();
    expect(modalityOf({ type: 'keydown', key: 'c' })).toBeNull();
  });
});
