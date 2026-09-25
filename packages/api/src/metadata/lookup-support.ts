/*
 * What the metadata providers share: comparing names across catalogues, a request rate limit
 * and a JSON fetch with a timeout.
 */

/**
 * A name reduced for comparison: accents and case dropped, punctuation removed, `&` read as
 * `and`, whitespace collapsed. Bracketed words stay: `Red Room (Nick Hakim Remix)` is another
 * recording than `Red Room`.
 */
export function comparable(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Two names that mean the same title, album or artist. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = comparable(a);
  return left !== '' && left === comparable(b);
}

/** The year of `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, or null. */
export function yearOf(date: string | number | null | undefined): number | null {
  if (typeof date === 'number') return date > 0 ? date : null;
  const match = date ? /^(\d{4})/.exec(date) : null;
  const year = match ? Number(match[1]) : Number.NaN;
  return Number.isInteger(year) && year > 0 ? year : null;
}

/** Waits `ms`, or rejects when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * At most one request per `intervalMs` across every caller (concurrent downloads share it): each
 * `wait()` resolves at the earliest `intervalMs` after the previous one did.
 */
export class RateLimiter {
  private next = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly delay: (ms: number, signal?: AbortSignal) => Promise<void> = sleep,
  ) {}

  async wait(signal?: AbortSignal): Promise<void> {
    const now = this.now();
    const at = Math.max(now, this.next);
    // Reserve the slot before waiting, so callers queue up in order.
    this.next = at + this.intervalMs;
    if (at > now) await this.delay(at - now, signal);
  }
}

/** A request to a metadata service that answered with an error status. */
export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    service: string,
  ) {
    super(`${service} answered HTTP ${status}`);
    this.name = 'ProviderHttpError';
  }
}

export interface FetchJsonOptions {
  /** Name for errors (`MusicBrainz`). */
  service: string;
  headers: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * GET a JSON document with a timeout (and the job's signal). Rejects with `ProviderHttpError`
 * on a non-2xx answer and with a timeout or network error as `fetch` does. The URL and headers
 * are never put into the error message (a token may be in them).
 */
export async function fetchJson(url: string, options: FetchJsonOptions): Promise<unknown> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, { headers: options.headers, signal });
  } catch (error) {
    if (timeout.aborted && !options.signal?.aborted) {
      throw new Error(`${options.service} did not answer within ${options.timeoutMs / 1000} s`, {
        cause: error,
      });
    }
    throw error;
  }
  if (!response.ok) throw new ProviderHttpError(response.status, options.service);
  return response.json();
}
