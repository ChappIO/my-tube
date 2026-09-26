import { describe, expect, it } from 'vitest';
import { buildArgs, describeArgs, JS_RUNTIME_ARG, networkArgs, withoutCookies } from './args.js';

describe('buildArgs', () => {
  it('builds the version call', () => {
    expect(buildArgs({ kind: 'version' })).toEqual(['--version']);
  });

  it('builds a metadata call with the URL after --', () => {
    const args = buildArgs({ kind: 'metadata', url: 'https://www.youtube.com/@NASA' });
    expect(args).toEqual([
      '--ignore-config',
      '--color',
      'never',
      '--js-runtimes',
      JS_RUNTIME_ARG,
      '--dump-single-json',
      '--flat-playlist',
      '--skip-download',
      '--no-warnings',
      '--extractor-args',
      'youtubetab:approximate_date',
      '--',
      'https://www.youtube.com/@NASA',
    ]);
  });

  it('limits entries and can skip approximate dates', () => {
    const args = buildArgs({
      kind: 'metadata',
      url: 'u',
      limit: 25,
      approximateDates: false,
    });
    expect(args).toContain('--playlist-items');
    expect(args[args.indexOf('--playlist-items') + 1]).toBe('1:25');
    expect(args).not.toContain('--extractor-args');
  });

  it('passes a format selector to a metadata call so it reports the chosen streams', () => {
    const args = buildArgs({ kind: 'metadata', url: 'u', format: 'bv+ba/b' });
    expect(args.slice(-4)).toEqual(['-f', 'bv+ba/b', '--', 'u']);
    expect(buildArgs({ kind: 'metadata', url: 'u' })).not.toContain('-f');
  });

  it('rejects a non-positive limit', () => {
    expect(() => buildArgs({ kind: 'metadata', url: 'u', limit: 0 })).toThrow('Invalid limit');
  });

  it('keeps a URL that looks like a flag positional', () => {
    const args = buildArgs({ kind: 'metadata', url: '--exec=rm -rf /' });
    expect(args.slice(-2)).toEqual(['--', '--exec=rm -rf /']);
  });

  it('builds a download call with progress, file print, format and extra args', () => {
    const args = buildArgs({
      kind: 'download',
      url: 'https://www.youtube.com/watch?v=abc',
      output: '/media/video/%(channel)s/%(title)s.%(ext)s',
      format: 'bv*+ba/b',
      mergeOutputFormat: 'mkv',
      extraArgs: ['--embed-thumbnail'],
      network: { rateLimit: '2M' },
    });
    expect(args).toEqual([
      '--ignore-config',
      '--color',
      'never',
      '--js-runtimes',
      JS_RUNTIME_ARG,
      '--no-playlist',
      '--newline',
      '--progress',
      '--progress-delta',
      '1',
      '--progress-template',
      'download:[mytube-progress] {"format_id":"%(info.format_id|)s","progress":%(progress.{status,downloaded_bytes,total_bytes,total_bytes_estimate,speed,eta,fragment_index,fragment_count})j}',
      '--progress-template',
      'postprocess:[mytube-progress] %(progress.{status,postprocessor})j',
      '--print',
      'after_move:[mytube-file] %(filepath)s',
      '-o',
      '/media/video/%(channel)s/%(title)s.%(ext)s',
      '-f',
      'bv*+ba/b',
      '--merge-output-format',
      'mkv',
      '--embed-thumbnail',
      '--limit-rate',
      '2M',
      '--',
      'https://www.youtube.com/watch?v=abc',
    ]);
  });

  it('refuses reserved flags in extraArgs', () => {
    for (const flag of ['--exec', '-o', '--print', '--cookies', '--proxy=x', '--']) {
      expect(() =>
        buildArgs({ kind: 'download', url: 'u', output: 'o', extraArgs: [flag] }),
      ).toThrow('Reserved yt-dlp flag');
    }
  });
});

describe('networkArgs', () => {
  it('is empty without options', () => {
    expect(networkArgs(undefined)).toEqual([]);
    expect(networkArgs({})).toEqual([]);
  });

  it('applies rate limit, proxy and cookies', () => {
    expect(
      networkArgs({ rateLimit: 500000, proxy: 'socks5://127.0.0.1:1080', cookiesFile: '/c.txt' }),
    ).toEqual([
      '--limit-rate',
      '500000',
      '--proxy',
      'socks5://127.0.0.1:1080',
      '--cookies',
      '/c.txt',
    ]);
    expect(networkArgs({ rateLimit: '4.2M' })).toEqual(['--limit-rate', '4.2M']);
  });

  it('rejects a malformed rate limit', () => {
    expect(() => networkArgs({ rateLimit: '5 MB/s' })).toThrow('Invalid rate limit');
  });

  it('is used by metadata calls too', () => {
    const args = buildArgs({ kind: 'metadata', url: 'u', network: { proxy: 'http://p:1' } });
    expect(args.slice(-4)).toEqual(['--proxy', 'http://p:1', '--', 'u']);
  });

  it('is used by the diagnostic format listing, which keeps the warnings', () => {
    const args = buildArgs({ kind: 'formats', url: 'u', network: { cookiesFile: '/c.txt' } });
    expect(args).toEqual([
      '--ignore-config',
      '--color',
      'never',
      '--js-runtimes',
      JS_RUNTIME_ARG,
      '-F',
      '--no-playlist',
      '--cookies',
      '/c.txt',
      '--',
      'u',
    ]);
  });

  it('drops only the cookies for a signed-out call', () => {
    expect(withoutCookies({ proxy: 'http://p:1', cookiesFile: '/c.txt' })).toEqual({
      proxy: 'http://p:1',
    });
    const plain = { proxy: 'http://p:1' };
    expect(withoutCookies(plain)).toBe(plain);
    expect(withoutCookies(undefined)).toBeUndefined();
  });
});

describe('describeArgs', () => {
  it('hides cookie paths and proxy credentials', () => {
    const text = describeArgs([
      '--cookies',
      '/config/cookies.txt',
      '--proxy',
      'http://user:secret@proxy:3128',
      '-o',
      '/media/a b/%(title)s.%(ext)s',
    ]);
    expect(text).not.toContain('cookies.txt');
    expect(text).not.toContain('secret');
    expect(text).toContain('--cookies <redacted>');
    expect(text).toContain('http://***@proxy:3128/');
    expect(text).toContain('"/media/a b/%(title)s.%(ext)s"');
  });
});
