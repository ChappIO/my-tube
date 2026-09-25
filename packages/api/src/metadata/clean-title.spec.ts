import { describe, expect, it } from 'vitest';
import { cleanTrackTitle } from './clean-title.js';

describe('cleanTrackTitle', () => {
  it('drops upload decoration, the artist prefix and quotes', () => {
    const artist = 'Hiatus Kaiyote';
    expect(cleanTrackTitle("Hiatus Kaiyote - 'Telescope' (Official Audio)", artist)).toBe(
      'Telescope',
    );
    expect(cleanTrackTitle("Hiatus Kaiyote  - 'Make Friends' (Official Audio)", artist)).toBe(
      'Make Friends',
    );
    expect(cleanTrackTitle('Hiatus Kaiyote - By Fire (Audio)', artist)).toBe('By Fire');
    expect(cleanTrackTitle('hiatus kaiyote – Nakamarra [Official Music Video]', artist)).toBe(
      'Nakamarra',
    );
    expect(cleanTrackTitle('Savanne (Official Visualizer)', 'Khruangbin')).toBe('Savanne');
    expect(cleanTrackTitle('Heatwave (Lyric Video)', null)).toBe('Heatwave');
  });

  it('keeps what belongs to the song', () => {
    expect(cleanTrackTitle('May Ninth', 'Khruangbin')).toBe('May Ninth');
    expect(cleanTrackTitle('Long Night (Live)', null)).toBe('Long Night (Live)');
    expect(cleanTrackTitle('Red Room (Nick Hakim Remix)', null)).toBe(
      'Red Room (Nick Hakim Remix)',
    );
    expect(cleanTrackTitle('Vieux Farka Touré et Khruangbin - Savanne', 'Khruangbin')).toBe(
      'Vieux Farka Touré et Khruangbin - Savanne',
    );
    expect(cleanTrackTitle("'Til Tuesday", null)).toBe("'Til Tuesday");
    expect(cleanTrackTitle('(Official Audio)', null)).toBe('(Official Audio)');
  });
});
