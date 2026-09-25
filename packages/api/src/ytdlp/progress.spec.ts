import { describe, expect, it } from 'vitest';
import { parseOutputLine } from './progress.js';

// Lines captured from yt-dlp 2026.08.19 with the runner's templates.
describe('parseOutputLine', () => {
  it('parses a downloading line', () => {
    const line =
      '[mytube-progress] {"status": "downloading", "downloaded_bytes": 1047552, "total_bytes": 3000000, "speed": 1046017.5032878566, "eta": 1}';
    expect(parseOutputLine(line)).toEqual({
      type: 'progress',
      progress: {
        status: 'downloading',
        percent: 34.9,
        downloadedBytes: 1047552,
        totalBytes: 3000000,
        speedBytesPerSec: 1046018,
        etaSeconds: 1,
      },
    });
  });

  it('reads the format id that wraps a download line', () => {
    // A media stream names its format; a subtitle track has none.
    expect(
      parseOutputLine(
        '[mytube-progress] {"format_id":"140-20","progress":{"status": "downloading", "downloaded_bytes": 1024, "total_bytes": 2458507}}',
      ),
    ).toMatchObject({
      progress: { status: 'downloading', downloadedBytes: 1024, formatId: '140-20' },
    });
    expect(
      parseOutputLine(
        '[mytube-progress] {"format_id":"","progress":{"status": "finished", "downloaded_bytes": 1642, "total_bytes": 1642}}',
      ),
    ).toMatchObject({ progress: { status: 'finished', totalBytes: 1642, formatId: null } });
  });

  it('parses a finished line without eta', () => {
    const line =
      '[mytube-progress] {"status": "finished", "downloaded_bytes": 3000000, "total_bytes": 3000000, "speed": 1042490.89}';
    const parsed = parseOutputLine(line);
    expect(parsed.type).toBe('progress');
    if (parsed.type !== 'progress') return;
    expect(parsed.progress.status).toBe('finished');
    expect(parsed.progress.percent).toBe(100);
    expect(parsed.progress.etaSeconds).toBeNull();
  });

  it('falls back to the size estimate and to fragments', () => {
    const estimate = parseOutputLine(
      '[mytube-progress] {"status": "downloading", "downloaded_bytes": 500, "total_bytes_estimate": 1000.4, "speed": null, "eta": null}',
    );
    expect(estimate).toMatchObject({
      progress: { percent: 50, totalBytes: 1000, speedBytesPerSec: null },
    });
    const fragments = parseOutputLine(
      '[mytube-progress] {"status": "downloading", "downloaded_bytes": 500, "fragment_index": 3, "fragment_count": 12}',
    );
    expect(fragments).toMatchObject({ progress: { percent: 25, totalBytes: null } });
  });

  it('prefers fragments over an estimate and flags the estimate', () => {
    // The first line of an HLS download: the init segment "estimates" the whole stream.
    const first = parseOutputLine(
      '[mytube-progress] {"format_id":"616","progress":{"status": "downloading", "downloaded_bytes": 712, "total_bytes_estimate": 712, "speed": 899.7, "fragment_index": 0, "fragment_count": 216}}',
    );
    expect(first).toMatchObject({ progress: { percent: 0, totalBytes: 712, estimated: true } });
    const exact = parseOutputLine(
      '[mytube-progress] {"format_id":"140","progress":{"status": "downloading", "downloaded_bytes": 4193280, "total_bytes": 19105583}}',
    );
    expect(exact).toMatchObject({ progress: { percent: 21.9, totalBytes: 19105583 } });
    expect(exact).not.toHaveProperty('progress.estimated');
  });

  it('reports unknown totals as null percent', () => {
    expect(
      parseOutputLine('[mytube-progress] {"status": "downloading", "downloaded_bytes": 10}'),
    ).toMatchObject({ progress: { percent: null, downloadedBytes: 10 } });
  });

  it('maps post-processor lines to postprocessing', () => {
    expect(
      parseOutputLine('[mytube-progress] {"status": "started", "postprocessor": "Merger"}'),
    ).toEqual({
      type: 'progress',
      progress: {
        status: 'postprocessing',
        percent: null,
        downloadedBytes: null,
        totalBytes: null,
        speedBytesPerSec: null,
        etaSeconds: null,
        postprocessor: 'Merger',
      },
    });
  });

  it('parses the final file line', () => {
    expect(parseOutputLine('[mytube-file] /media/video/NASA/What It Takes.mkv')).toEqual({
      type: 'file',
      path: '/media/video/NASA/What It Takes.mkv',
    });
  });

  it('passes other lines through, including broken progress JSON', () => {
    expect(parseOutputLine('[youtube] abc: Downloading webpage')).toEqual({
      type: 'other',
      line: '[youtube] abc: Downloading webpage',
    });
    expect(parseOutputLine('[mytube-progress] {not json').type).toBe('other');
    expect(parseOutputLine('[mytube-progress] {"downloaded_bytes": 1}').type).toBe('other');
  });
});
