import type { Job } from '@mytube/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JobInfo } from './JobInfo';
import { LogPane } from './LogPane';
import { LogToolbar, type LogToolbarProps } from './LogToolbar';

/** The markup's text without tags. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const noop = () => {};

function toolbar(props: Partial<LogToolbarProps> = {}) {
  return renderToStaticMarkup(
    <LogToolbar
      view={{ wrap: false, autoScroll: true }}
      copyState="idle"
      onCopy={noop}
      onDownload={noop}
      onToggleWrap={noop}
      onToggleAutoScroll={noop}
      empty={false}
      {...props}
    />,
  );
}

/** The opening tag of the `<button>` named `label`. */
const button = (html: string, label: string) =>
  html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? '';

describe('LogToolbar', () => {
  it('shows Copy, Download and the two toggles with their pressed state', () => {
    const html = toolbar({ lines: '12 lines', size: '1.2 KB' });
    expect(html).toContain('role="toolbar"');
    // The top part of the log block: surface with the line divider below it.
    expect(html).toContain('border-b border-line bg-surface px-3 py-2');
    expect(text(html)).toBe('Copy Download Wrap Auto-scroll 12 lines · 1.2 KB');
    // Each button has its icon; the label hides below 760px and stays as the accessible name.
    expect(html.match(/<svg/g)).toHaveLength(4);
    expect(html).toContain('<span class="hidden wide:inline">Wrap</span>');
    expect(button(html, 'Wrap')).toContain('aria-pressed="false"');
    expect(button(html, 'Wrap')).toContain('border-line');
    expect(button(html, 'Auto-scroll')).toContain('aria-pressed="true"');
    expect(button(html, 'Auto-scroll')).toContain('border-ink');
    // Copy and Download are actions, not toggles.
    expect(button(html, 'Copy')).not.toContain('aria-pressed');

    const flipped = toolbar({ view: { wrap: true, autoScroll: false } });
    expect(button(flipped, 'Wrap')).toContain('aria-pressed="true"');
    expect(button(flipped, 'Auto-scroll')).toContain('aria-pressed="false"');
  });

  it('reads Copied after a copy and disables the file actions without a log', () => {
    const copied = toolbar({ copyState: 'copied', lines: '12 lines' });
    expect(button(copied, 'Copied')).not.toBe('');
    // Narrow screens show the result in place of the line count.
    expect(copied).toContain('<span class="wide:hidden">Copied</span>');
    expect(copied).toContain('<span class="hidden wide:inline">12 lines</span>');
    expect(button(toolbar({ copyState: 'failed' }), 'Copy failed')).not.toBe('');
    const empty = toolbar({ empty: true });
    expect(button(empty, 'Copy')).toContain('disabled=""');
    expect(button(empty, 'Download')).toContain('disabled=""');
    expect(button(empty, 'Wrap')).not.toContain('disabled=""');
  });
});

describe('LogPane', () => {
  const log = '=== download job 3 · attempt 1 of 3\n09:05:07.042 $ yt-dlp -- https://x';

  it('does not wrap by default and scrolls on both axes', () => {
    const html = renderToStaticMarkup(
      <LogPane
        text={log}
        wrap={false}
        autoScroll
        onScrolled={noop}
        label="Log of Clip"
        toolbar={<div role="toolbar" />}
      />,
    );
    // One surface block, radius 12, clipping: the toolbar on top, then the scroller.
    expect(html).toMatch(
      /^<div class="[^"]*overflow-hidden rounded-tile bg-surface"><div role="toolbar"><\/div><pre/,
    );
    expect(html).toContain('aria-label="Log of Clip"');
    expect(html).toMatch(/whitespace-pre["\s]/);
    expect(html).not.toContain('whitespace-pre-wrap');
    expect(html).toContain('overflow-auto');
    // The timestamp column is muted; the header line has none.
    expect(html).toContain('<span class="text-muted">09:05:07.042 </span>$ yt-dlp');
    expect(text(html)).toBe(
      '=== download job 3 · attempt 1 of 3 09:05:07.042 $ yt-dlp -- https://x',
    );
  });

  it('wraps long lines with Wrap on', () => {
    const html = renderToStaticMarkup(
      <LogPane
        text={log}
        wrap
        autoScroll={false}
        onScrolled={noop}
        label="Log of Clip"
        toolbar={null}
      />,
    );
    expect(html).toContain('whitespace-pre-wrap');
  });

  it('shows a status line instead of the log', () => {
    const html = renderToStaticMarkup(
      <LogPane
        text=""
        wrap={false}
        autoScroll
        onScrolled={noop}
        label="x"
        status="No log yet."
        toolbar={<div role="toolbar" />}
      />,
    );
    expect(html).not.toContain('<pre');
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('role="status"');
    expect(text(html)).toBe('No log yet.');
  });
});

const job: Job = {
  id: 42,
  type: 'download',
  status: 'failed',
  title: 'What It Takes',
  subtitle: 'NASA',
  progress: null,
  speedBytesPerSec: null,
  etaSeconds: null,
  totalBytes: 1_200_000_000,
  stage: null,
  detail: '1080p',
  error: 'yt-dlp exited 1\nERROR: [youtube] abc: Video unavailable',
  attempts: 3,
  maxAttempts: 3,
  runAfter: '2026-09-25T10:00:00.000Z',
  createdAt: '2026-09-25T10:00:00.000Z',
  startedAt: '2026-09-25T10:00:05.000Z',
  finishedAt: '2026-09-25T10:03:12.000Z',
  updatedAt: '2026-09-25T10:03:12.000Z',
};

describe('JobInfo', () => {
  it('shows the title, channel, status, facts and the error of a failed job', () => {
    const html = renderToStaticMarkup(
      <JobInfo job={job} fallbackTitle="Job 42" onClose={noop} now={0} />,
    );
    const words = text(html);
    expect(words).toContain('What It Takes NASA failed');
    expect(words).toContain('Type download Attempt 3 of 3');
    expect(words).toContain('Duration 3m 07s');
    expect(words).toContain('Size 1.2 GB');
    expect(words).toContain('Job #42');
    expect(words).not.toContain('Speed');
    expect(words).toContain('ERROR: [youtube] abc: Video unavailable');
    expect(words).not.toContain('yt-dlp exited 1');
    expect(html).toContain('aria-label="Close"');
  });

  it('shows the speed of a running job and no error', () => {
    const running: Job = {
      ...job,
      status: 'running',
      attempts: 0,
      progress: 0.5,
      speedBytesPerSec: 4_100_000,
      finishedAt: null,
    };
    const words = text(
      renderToStaticMarkup(
        <JobInfo
          job={running}
          fallbackTitle="Job 42"
          onClose={noop}
          now={Date.parse('2026-09-25T10:00:17.000Z')}
        />,
      ),
    );
    expect(words).toContain('downloading 50%');
    expect(words).toContain('Attempt 1 of 3');
    expect(words).toContain('Duration 12s');
    expect(words).toContain('Speed 4.1 MB/s');
    expect(words).not.toContain('Finished');
    expect(words).not.toContain('ERROR');
  });

  it('falls back to a title and a note without a job', () => {
    const words = text(
      renderToStaticMarkup(
        <JobInfo
          job={undefined}
          fallbackTitle="Job 42"
          note="This job is no longer known."
          onClose={noop}
          now={0}
        />,
      ),
    );
    expect(words).toBe('Job 42 This job is no longer known.');
  });
});
