import type { CookiesStatus } from '@mytube/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiErrorMessage } from '../../api/client';
import { cookiesQueryKey, cookiesValueText, runCookiesAction } from '../../api/cookies';
import {
  CHROME_EXPORTER_URL,
  CookiesHelpModal,
  FIREFOX_EXPORTER_URL,
  YTDLP_COOKIES_FAQ_URL,
} from './CookiesHelpModal';
import { CookiesPasteModal } from './CookiesPasteModal';
import { CookiesRow } from './CookiesRow';

// Modals portal into document.body; render them in place so the server renderer can.
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (node: ReactNode) => node,
}));

/** The markup's text without tags. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const NOW = Date.parse('2026-09-25T12:00:00Z');

const NOT_SET: CookiesStatus = {
  managed: false,
  path: null,
  cookieCount: null,
  domains: [],
  updatedAt: null,
  expiresSoonest: null,
};

const MANAGED: CookiesStatus = {
  managed: true,
  path: '/config/cookies.txt',
  cookieCount: 12,
  domains: ['youtube.com', 'google.com'],
  updatedAt: '2026-09-25T10:00:00Z',
  expiresSoonest: '2026-10-20T10:00:00Z',
};

const BY_PATH: CookiesStatus = { ...MANAGED, managed: false, path: '/mnt/cookies.txt' };

describe('cookiesValueText', () => {
  it('reads not set, the managed summary, or the path set by hand', () => {
    expect(cookiesValueText(NOT_SET, NOW)).toBe('not set');
    expect(cookiesValueText(MANAGED, NOW)).toBe(
      '12 cookies · youtube.com, google.com · updated 2 h ago',
    );
    expect(cookiesValueText(BY_PATH, NOW)).toBe('/mnt/cookies.txt');
  });

  it('says one cookie, and no file when the managed file is gone', () => {
    expect(cookiesValueText({ ...MANAGED, cookieCount: 1, domains: ['youtube.com'] }, NOW)).toBe(
      '1 cookie · youtube.com · updated 2 h ago',
    );
    expect(cookiesValueText({ ...MANAGED, cookieCount: null, domains: [] }, NOW)).toBe('no file');
  });
});

describe('runCookiesAction', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('sends pasted text as a text/plain PUT and parses the status', async () => {
    fetchMock.mockResolvedValue(Response.json(MANAGED));
    expect(await runCookiesAction({ upload: '# Netscape HTTP Cookie File\n' })).toEqual(MANAGED);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/system/cookies');
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toMatchObject({ 'content-type': 'text/plain; charset=utf-8' });
    expect(init?.body).toBe('# Netscape HTTP Cookie File\n');
  });

  it('sends a picked file as the body', async () => {
    fetchMock.mockResolvedValue(Response.json(MANAGED));
    const file = new File(['x'], 'cookies.txt');
    await runCookiesAction({ upload: file });
    expect(fetchMock.mock.calls[0]![1]?.body).toBe(file);
  });

  it('removes with DELETE', async () => {
    fetchMock.mockResolvedValue(Response.json(NOT_SET));
    expect(await runCookiesAction({ remove: true })).toEqual(NOT_SET);
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('DELETE');
  });

  it("rejects with the API's message for a bad file", async () => {
    const message = 'This file has no YouTube or Google cookies.';
    fetchMock.mockResolvedValue(Response.json({ message, statusCode: 400 }, { status: 400 }));
    const error = await runCookiesAction({ upload: 'nope' }).catch((reason: unknown) => reason);
    expect(apiErrorMessage(error, 'fallback')).toBe(message);
  });
});

/** The Cookies row's markup with `status` already loaded. */
function row(status: CookiesStatus): string {
  const client = new QueryClient();
  client.setQueryData(cookiesQueryKey, status);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <CookiesRow onPathChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('CookiesRow', () => {
  beforeEach(() => vi.stubGlobal('document', { body: {} }));
  afterEach(() => vi.unstubAllGlobals());

  it('shows the managed file with Remove', () => {
    const html = text(row(MANAGED));
    expect(html).toMatch(/^Cookies 12 cookies · youtube\.com, google\.com · updated .+ ago/);
    expect(html).toContain('Upload Paste Remove How to export cookies');
  });

  it('shows a path set by hand in the path box, with the note and no Remove', () => {
    const html = row(BY_PATH);
    expect(html).toContain('value="/mnt/cookies.txt"');
    expect(text(html)).toContain('Set by path; upload replaces it. Upload Paste How to export');
  });

  it('shows "not set" as the path box placeholder', () => {
    const html = row(NOT_SET);
    expect(html).toContain('placeholder="not set"');
    expect(html).not.toContain('Set by path');
    expect(text(html)).not.toContain('Remove');
  });
});

/** Matches an `<a>` to `href` that opens in a new tab, with `name` as its text. */
function link(href: string, name: string): RegExp {
  const escaped = href.replace(/[.?]/g, '\\$&');
  return new RegExp(`<a href="${escaped}" target="_blank" rel="noreferrer"[^>]*>${name}</a>`);
}

describe('CookiesHelpModal', () => {
  beforeEach(() => vi.stubGlobal('document', { body: {} }));
  afterEach(() => vi.unstubAllGlobals());

  it('renders nothing while closed', () => {
    expect(renderToStaticMarkup(<CookiesHelpModal open={false} onClose={() => {}} />)).toBe('');
  });

  it('opens with the numbered steps and the notes', () => {
    const html = renderToStaticMarkup(<CookiesHelpModal open onClose={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html.match(/<li/g)).toHaveLength(5);
    const body = text(html);
    expect(body).toMatch(/^Export cookies from your browser Why\./);
    expect(body).toContain('Chrome, Chromium, Edge or Brave: Get cookies.txt LOCALLY');
    expect(body).toContain('--cookies-from-browser');
    expect(body).toContain('leaves it out of backups');
    // The exporters and yt-dlp's FAQ are links that open in a new tab.
    expect(html).toMatch(link(CHROME_EXPORTER_URL, 'Get cookies.txt LOCALLY'));
    expect(html).toMatch(link(FIREFOX_EXPORTER_URL, 'cookies.txt'));
    expect(html).toMatch(link(YTDLP_COOKIES_FAQ_URL, 'yt-dlp&#x27;s own guidance'));
    expect(CHROME_EXPORTER_URL).toBe(
      'https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc',
    );
    expect(FIREFOX_EXPORTER_URL).toBe('https://addons.mozilla.org/firefox/addon/cookies-txt/');
  });
});

describe('CookiesPasteModal', () => {
  beforeEach(() => vi.stubGlobal('document', { body: {} }));
  afterEach(() => vi.unstubAllGlobals());

  it('has a monospace box and a Save that waits for text', () => {
    const html = renderToStaticMarkup(
      <CookiesPasteModal open onClose={() => {}} onSave={() => {}} saving={false} />,
    );
    expect(html).toContain('<textarea');
    expect(html).toContain('font-mono');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/);
  });

  it('shows the error of a failed save', () => {
    const html = renderToStaticMarkup(
      <CookiesPasteModal
        open
        onClose={() => {}}
        onSave={() => {}}
        saving
        error="This file has no YouTube or Google cookies."
      />,
    );
    expect(text(html)).toContain('This file has no YouTube or Google cookies. Cancel Saving…');
    expect(html).toContain('aria-invalid="true"');
  });
});
