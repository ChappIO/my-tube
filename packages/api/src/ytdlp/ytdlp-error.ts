import type { FormatListing } from './formats.js';

/**
 * Why a yt-dlp invocation failed.
 * - `spawn`: the binary could not be started (missing, not executable).
 * - `exit`: it ran and exited non-zero (or was killed by a signal we did not send).
 * - `aborted`: the caller's AbortSignal fired and we killed it.
 * - `output`: it exited 0 but printed something we could not use.
 */
export type YtdlpErrorKind = 'spawn' | 'exit' | 'aborted' | 'output';

/**
 * Failures the runner handles on its own (`YtdlpRunner.withCookieFallback`):
 * - `format_unavailable`: `Requested format is not available`. No stream matched the `-f`
 *   selector; with a signed-in session (cookies) this is usually yt-dlp skipping every web-client
 *   format that needs a GVS PO token.
 * - `bot_check`: `Sign in to confirm you're not a bot`. YouTube wants a signed-in session.
 * - `sign_in`: members-only, Premium-only, age-restricted, private or any other "sign in" /
 *   "use --cookies" refusal a signed-in session may get past.
 */
export type YtdlpFailure = 'format_unavailable' | 'bot_check' | 'sign_in';

const FAILURES: readonly [YtdlpFailure, RegExp][] = [
  ['format_unavailable', /requested format is not available/i],
  ['bot_check', /confirm you.re not a bot/i],
  [
    'sign_in',
    /sign in|log ?in required|--cookies|members[- ]only|members on level|join this channel|premium members|premium[- ]only|age[- ]restricted|confirm your age|inappropriate for some users/i,
  ],
];

/** The known failure an error reason (a yt-dlp `ERROR:` line) describes, if any. */
export function ytdlpFailure(reason: string | null | undefined): YtdlpFailure | null {
  if (!reason) return null;
  for (const [failure, pattern] of FAILURES) if (pattern.test(reason)) return failure;
  return null;
}

/** Whether a signed-in session (the cookies file) may get past this failure. */
export function cookiesMayHelp(failure: YtdlpFailure | null): boolean {
  return failure === 'bot_check' || failure === 'sign_in';
}

export class YtdlpError extends Error {
  override readonly name = 'YtdlpError';
  /**
   * For a `format_unavailable` failure: the diagnostic `-F` listing the runner made for it (once
   * per `YtdlpSession`, so later failures in the same job carry the same one).
   */
  listing: FormatListing | null = null;

  constructor(
    message: string,
    readonly kind: YtdlpErrorKind,
    /** Exit code, or null when killed by a signal or never started. */
    readonly exitCode: number | null,
    /** The last stderr lines, oldest first. Progress lines are not included. */
    readonly stderrTail: readonly string[],
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }

  /** The most useful single line: the last `ERROR:` line yt-dlp printed, if any. */
  get reason(): string | null {
    for (let i = this.stderrTail.length - 1; i >= 0; i--) {
      const line = this.stderrTail[i]!;
      if (line.startsWith('ERROR:')) return line.slice('ERROR:'.length).trim();
    }
    return null;
  }

  /** The known failure behind `reason` (see `YtdlpFailure`), else null. */
  get failure(): YtdlpFailure | null {
    return this.kind === 'exit' ? ytdlpFailure(this.reason) : null;
  }
}

/** Whether `error` is a yt-dlp run that failed with the given known failure. */
export function isYtdlpFailure(error: unknown, failure: YtdlpFailure): error is YtdlpError {
  return error instanceof YtdlpError && error.failure === failure;
}

/**
 * Whether a failed call means the item has nothing to download at all: `Requested format is not
 * available`, and the diagnostic listing made without cookies (so no PO-token loss) shows no
 * format even with warnings on (a premium-only track, for one). Retrying cannot help. A table of
 * storyboards only does not count: that is formats skipped (SABR, PO tokens), which a yt-dlp
 * update can fix, so it stays retryable.
 */
export function noDownloadableFormat(error: unknown): boolean {
  return (
    isYtdlpFailure(error, 'format_unavailable') &&
    error.listing !== null &&
    !error.listing.withCookies &&
    error.listing.mediaFormats === 0 &&
    error.listing.storyboards === 0
  );
}
