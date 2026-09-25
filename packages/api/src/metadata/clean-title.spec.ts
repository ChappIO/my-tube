import { describe, expect, it } from 'vitest';
import { cleanTrackTitle, parseTrackTitle } from './clean-title.js';

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

  it('drops framing symbols, release tags and a collaboration prefix naming the artist', () => {
    const cases: [string, string, string[]][] = [
      ['♪ MDK x t+pazolite - Password ♪', 'Password', ['t+pazolite']],
      ['♪ MDK - Wubtendo 64 ♪', 'Wubtendo 64', []],
      ['♪ Hyper Potions x MDK - Nocturne ♪ [CHOMPO RELEASE]', 'Nocturne', ['Hyper Potions']],
      [
        '♪ TOKYO MACHINE X MDK - DECK THE HALLS [CHOMPO RELEASE] ♪',
        'DECK THE HALLS',
        ['TOKYO MACHINE'],
      ],
      ['♪ MDK & Treyx - Colour Cannon ♪', 'Colour Cannon', ['Treyx']],
      ['MDK feat. Someone, Other – Title', 'Title', ['Someone', 'Other']],
      ['★ MDK - Cutlass ★', 'Cutlass', []],
      ['| MDK - Speed Boost |', 'Speed Boost', []],
      ['~ MDK - Anxiety ~', 'Anxiety', []],
      ['🔥 MDK - KILLSHOT 🔥', 'KILLSHOT', []],
      ['♪ MDK - Snowdown (VIP Mix) ♪', 'Snowdown (VIP Mix)', []],
      ['♪ MDK & Sterrezo - Lightspeed [FREE DOWNLOAD] ♪', 'Lightspeed', ['Sterrezo']],
      [
        '♪ MDK ft. Nick Sadler - Phoenix (Miu Remix) [FREE DOWNLOAD] ♪',
        'Phoenix (Miu Remix)',
        ['Nick Sadler'],
      ],
    ];
    for (const [upload, title, featuredArtists] of cases) {
      expect(parseTrackTitle(upload, 'MDK')).toMatchObject({ title, featuredArtists });
    }
    expect(parseTrackTitle('♪ MDK x t+pazolite - Password ♪', 'MDK').plain).toBe(
      'MDK x t+pazolite - Password',
    );
  });

  it('keeps credits that do not name the artist', () => {
    expect(parseTrackTitle('♪ DanTDM - Spacedog (MDK Remix) ♪', 'MDK')).toMatchObject({
      title: 'DanTDM - Spacedog (MDK Remix)',
      featuredArtists: [],
    });
    expect(cleanTrackTitle('Wubtendo-64', 'MDK')).toBe('Wubtendo-64');
    expect(cleanTrackTitle('Crosby, Stills & Nash - Helplessly Hoping', 'Nash')).toBe(
      'Helplessly Hoping',
    );
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
