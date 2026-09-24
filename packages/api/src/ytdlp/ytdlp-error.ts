/**
 * Why a yt-dlp invocation failed.
 * - `spawn`: the binary could not be started (missing, not executable).
 * - `exit`: it ran and exited non-zero (or was killed by a signal we did not send).
 * - `aborted`: the caller's AbortSignal fired and we killed it.
 * - `output`: it exited 0 but printed something we could not use.
 */
export type YtdlpErrorKind = 'spawn' | 'exit' | 'aborted' | 'output';

export class YtdlpError extends Error {
  override readonly name = 'YtdlpError';

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
}
