/**
 * Pure reading of a Netscape cookies file (the `cookies.txt` format browser exporters write and
 * yt-dlp's `--cookies` reads). Only the shape is looked at: domains, expiry and a count. Cookie
 * names and values are never returned, so nothing here can leak them into a response or a log.
 */

/** The first line exporters write: `# Netscape HTTP Cookie File` (or `# HTTP Cookie File`). */
const HEADER = /^#\s*(Netscape\s+)?HTTP Cookie File/i;

/** curl and some exporters mark HttpOnly cookies by prefixing the domain field. */
const HTTP_ONLY_PREFIX = '#HttpOnly_';

/** The header MyTube writes when an otherwise valid file has none (yt-dlp does not need it). */
export const NETSCAPE_HEADER = '# Netscape HTTP Cookie File';

/** One cookie line, without its name and value. */
export interface CookieLine {
  /** The domain field without a leading dot, lower case (`youtube.com`, `accounts.google.com`). */
  domain: string;
  /** Unix seconds; 0 for a session cookie. */
  expires: number;
}

export interface ParsedCookies {
  /** The first non-empty line is the Netscape header. */
  hasHeader: boolean;
  cookies: CookieLine[];
}

/** The largest time a JS `Date` holds, in seconds. */
const MAX_UNIX_SECONDS = 8.64e12;

const BOOLEAN = /^(TRUE|FALSE)$/i;

/** One line as a cookie: 7 tab-separated fields, else null (comments, blanks, garbage). */
function parseLine(raw: string): CookieLine | null {
  let line = raw;
  if (line.startsWith(HTTP_ONLY_PREFIX)) line = line.slice(HTTP_ONLY_PREFIX.length);
  else if (line.startsWith('#')) return null;
  const fields = line.split('\t');
  if (fields.length !== 7) return null;
  const [domain = '', subdomains = '', path = '', secure = '', expires = ''] = fields;
  if (!/^\.?[a-z0-9.-]+$/i.test(domain)) return null;
  if (!BOOLEAN.test(subdomains) || !BOOLEAN.test(secure) || !path.startsWith('/')) return null;
  if (!/^\d+(\.\d+)?$/.test(expires)) return null;
  return { domain: domain.replace(/^\./, '').toLowerCase(), expires: Math.floor(Number(expires)) };
}

/** Splits the text into lines (LF or CRLF) and reads the header and the cookie lines. */
export function parseCookies(text: string): ParsedCookies {
  const lines = text.split(/\r?\n/);
  const first = lines.find((line) => line.trim() !== '');
  const cookies = lines.map(parseLine).filter((cookie) => cookie !== null);
  return { hasHeader: first !== undefined && HEADER.test(first.trim()), cookies };
}

/**
 * The site a cookie domain belongs to: its last two labels (`www.youtube.com` → `youtube.com`),
 * three for a country second-level domain (`google.co.uk`).
 */
export function siteOf(domain: string): string {
  const labels = domain.split('.').filter(Boolean);
  const secondLevel = labels.at(-2) ?? '';
  const take = labels.length > 2 && labels.at(-1)!.length === 2 && secondLevel.length <= 3 ? 3 : 2;
  return labels.slice(-take).join('.');
}

/** Whether a cookie is YouTube's or Google's (sign-in), the only ones yt-dlp needs here. */
export function isYoutubeOrGoogle(domain: string): boolean {
  return /(^|\.)(youtube\.com|google\.com)$/.test(domain);
}

/** The answer to a file over `COOKIES_MAX_BYTES` (1 MiB). */
export const COOKIES_TOO_LARGE = 'The cookies file is larger than 1 MB.';

/** A validation failure with the line for the user. */
export class CookiesFileError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
    this.name = 'CookiesFileError';
  }
}

/**
 * Checks an upload and returns the text to store: line endings normalised to LF, the Netscape
 * header added when missing, and a trailing newline. Throws `CookiesFileError` for a file over
 * `maxBytes` (413), one that is not a cookies file, or one without YouTube or Google cookies (400).
 */
export function validateCookies(text: string, maxBytes: number): { text: string; count: number } {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new CookiesFileError(COOKIES_TOO_LARGE, 413);
  }
  const parsed = parseCookies(text);
  if (!parsed.hasHeader && parsed.cookies.length === 0) {
    throw new CookiesFileError(
      'This is not a cookies file. Export it in Netscape (cookies.txt) format.',
      400,
    );
  }
  if (!parsed.cookies.some((cookie) => isYoutubeOrGoogle(cookie.domain))) {
    throw new CookiesFileError('This file has no YouTube or Google cookies.', 400);
  }
  const body = text.replace(/\r\n?/g, '\n').replace(/\n*$/, '\n');
  return {
    text: parsed.hasHeader ? body : `${NETSCAPE_HEADER}\n${body}`,
    count: parsed.cookies.length,
  };
}

/** What the status shows of a file: count, top sites (most cookies first) and soonest expiry. */
export function summarizeCookies(
  parsed: ParsedCookies,
  topSites = 3,
): { cookieCount: number; domains: string[]; expiresSoonest: string | null } {
  const counts = new Map<string, number>();
  for (const { domain } of parsed.cookies) {
    const site = siteOf(domain);
    counts.set(site, (counts.get(site) ?? 0) + 1);
  }
  const domains = [...counts]
    .toSorted(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, topSites)
    .map(([site]) => site);
  // Session cookies have 0; absurd values (past year 275760) would not make a Date.
  let soonest: number | null = null;
  for (const { expires } of parsed.cookies) {
    if (expires > 0 && expires < MAX_UNIX_SECONDS && (soonest === null || expires < soonest)) {
      soonest = expires;
    }
  }
  return {
    cookieCount: parsed.cookies.length,
    domains,
    expiresSoonest: soonest === null ? null : new Date(soonest * 1000).toISOString(),
  };
}
