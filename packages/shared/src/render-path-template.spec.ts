import { describe, expect, it } from 'vitest';
import {
  EMPTY_PATH_FALLBACK,
  PATH_SEGMENT_MAX_BYTES,
  renderPathTemplate,
  sanitizePathSegment,
} from './path-templates.js';
import { DEFAULT_SETTINGS } from './settings.js';

/** UTF-8 byte length without TextEncoder (shared has no DOM or Node types). */
const utf8Bytes = (text: string) => encodeURIComponent(text).replace(/%[0-9A-F]{2}/g, 'x').length;

const video = {
  channel: 'NASA',
  title: 'Artemis III: Our Next Step',
  date: '2026-09-20',
  year: 2026,
  id: 'jHKf1eHp3eQ',
  playlist: null,
};

describe('renderPathTemplate', () => {
  it('fills the default video template', () => {
    expect(renderPathTemplate(DEFAULT_SETTINGS.video.pathTemplate, video)).toBe(
      'NASA/Artemis III Our Next Step (2026-09-20)',
    );
  });

  it('pads numeric tags with :02 and leaves longer numbers alone', () => {
    const template = DEFAULT_SETTINGS.music.pathTemplate;
    const values = { artist: 'Radiohead', album: 'In Rainbows', title: '15 Step', track: 7 };
    expect(renderPathTemplate(template, values)).toBe('Radiohead/In Rainbows/07 15 Step');
    expect(renderPathTemplate(template, { ...values, track: 123 })).toBe(
      'Radiohead/In Rainbows/123 15 Step',
    );
    expect(renderPathTemplate('{year:02}', { year: '5' })).toBe('05');
  });

  it('drops empty folders such as {playlist} outside a playlist', () => {
    expect(renderPathTemplate('{channel}/{playlist}/{title}', video)).toBe(
      'NASA/Artemis III Our Next Step',
    );
    expect(renderPathTemplate('{channel}/{playlist}/{title}', { ...video, playlist: 'Moon' })).toBe(
      'NASA/Moon/Artemis III Our Next Step',
    );
  });

  it('never lets a value add folders or climb out of the library', () => {
    expect(
      renderPathTemplate('{channel}/{title}', { channel: '..', title: '../../etc/passwd' }),
    ).toBe('etcpasswd');
    expect(renderPathTemplate('{title}', { title: '..' })).toBe(EMPTY_PATH_FALLBACK);
    expect(renderPathTemplate('{channel}/{title}', { channel: 'a/b\\c', title: 'x' })).toBe(
      'abc/x',
    );
    expect(renderPathTemplate('{title}', { title: '/absolute' })).toBe('absolute');
  });

  it('removes characters invalid on common filesystems and control characters', () => {
    expect(sanitizePathSegment('What? <Why> "now": a|b*c\u0000\u001f\u007f')).toBe(
      'What Why now abc',
    );
    expect(sanitizePathSegment('  tabs\tand\nnewlines  ')).toBe('tabs and newlines');
    expect(sanitizePathSegment('...hidden.')).toBe('hidden');
  });

  it('keeps unicode and normalises it to NFC', () => {
    const decomposed = 'Café ☕ 東京 🚀';
    expect(sanitizePathSegment(decomposed)).toBe('Café ☕ 東京 🚀');
  });

  it('cuts long names to the byte limit without splitting a character', () => {
    const long = sanitizePathSegment('é'.repeat(150));
    expect(utf8Bytes(long)).toBeLessThanOrEqual(PATH_SEGMENT_MAX_BYTES);
    expect(long).toBe('é'.repeat(100));
    const emoji = sanitizePathSegment(`a${'🚀'.repeat(60)}`);
    expect(utf8Bytes(emoji)).toBeLessThanOrEqual(PATH_SEGMENT_MAX_BYTES);
    expect(emoji.endsWith('🚀')).toBe(true);
    // A cut that ends in a space or dot is trimmed again.
    expect(sanitizePathSegment(`${'a'.repeat(199)} b`)).toBe('a'.repeat(199));
  });

  it('renders unknown tags and missing values as nothing', () => {
    expect(renderPathTemplate('{channel}/{bogus}{title}', { channel: 'A' })).toBe('A');
    expect(renderPathTemplate('{title}', {})).toBe(EMPTY_PATH_FALLBACK);
  });
});
