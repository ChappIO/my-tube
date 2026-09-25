/*
 * Pure helpers of the log viewer (`LogViewerModal`, `LogToolbar`, `LogPane`), tested in
 * `job-log.spec.ts`.
 */

/**
 * The viewer shows the whole log up to this many characters (about 2 MB); a longer one shows
 * its newest part, with a note that Download has the whole file.
 */
export const JOB_LOG_MAX_CHARS = 2 * 1024 * 1024;

/**
 * The part of a log the viewer shows: all of it (without the trailing newline) when it fits in
 * `maxChars`, else its newest whole lines within `maxChars`, and how many lines were left out.
 */
export function tailText(
  text: string,
  maxChars = JOB_LOG_MAX_CHARS,
): { text: string; droppedLines: number } {
  const trimmed = text.replace(/\n$/, '');
  if (trimmed.length <= maxChars) return { text: trimmed, droppedLines: 0 };
  // Start at the first whole line inside the last `maxChars` characters.
  const from = trimmed.indexOf('\n', trimmed.length - maxChars - 1) + 1;
  const head = trimmed.slice(0, from);
  const droppedLines = head.split('\n').length - 1;
  return { text: trimmed.slice(from), droppedLines };
}

/** The API's line prefix: `HH:MM:SS.mmm ` (backend skill, Logging). */
const TIMESTAMP = /^(\d\d:\d\d:\d\d\.\d{3} )/;

/**
 * A log line split into its timestamp (muted in the pane) and the rest. Lines without one (the
 * attempt header, logs written before timestamps) are all `rest`.
 */
export function splitTimestamp(line: string): { time: string | null; rest: string } {
  const match = TIMESTAMP.exec(line);
  if (!match?.[1]) return { time: null, rest: line };
  return { time: match[1], rest: line.slice(match[1].length) };
}

/** The toolbar's toggles. */
export interface LogView {
  /** Long lines wrap (`pre-wrap`); off by default: one line per line, scrolled sideways. */
  wrap: boolean;
  /** The pane keeps the newest line in view as the log grows. */
  autoScroll: boolean;
}

export type LogViewEvent =
  | { type: 'toggle-wrap' }
  | { type: 'toggle-auto-scroll' }
  /** The reader scrolled the pane; `atBottom` from `isAtBottom`. */
  | { type: 'scrolled'; atBottom: boolean; running: boolean };

/** Wrap off; auto-scroll on while the job runs, off for a finished or failed one. */
export function initialLogView(running: boolean): LogView {
  return { wrap: false, autoScroll: running };
}

/**
 * The toolbar and scroll rules: the toggles flip; switching auto-scroll on jumps to the bottom
 * (the pane does that whenever it is on); scrolling up turns it off, and scrolling back to the
 * bottom turns it on again while the job runs.
 */
export function logViewReducer(view: LogView, event: LogViewEvent): LogView {
  if (event.type === 'toggle-wrap') return { ...view, wrap: !view.wrap };
  if (event.type === 'toggle-auto-scroll') return { ...view, autoScroll: !view.autoScroll };
  const autoScroll = event.atBottom ? view.autoScroll || event.running : false;
  return autoScroll === view.autoScroll ? view : { ...view, autoScroll };
}

/** How close to the bottom (px) still counts as "at the bottom", so new lines keep following. */
const FOLLOW_SLACK_PX = 16;

/** Whether the pane is scrolled to (within 16px of) the bottom. */
export function isAtBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= FOLLOW_SLACK_PX;
}

/** How long Copy reads "Copied" (or "Copy failed"). */
export const COPIED_MS = 1_500;

export type CopyState = 'idle' | 'copied' | 'failed';

/** The Copy button's label. */
export function copyLabel(state: CopyState): string {
  if (state === 'copied') return 'Copied';
  if (state === 'failed') return 'Copy failed';
  return 'Copy';
}

/**
 * Copy's state machine: `copy(text)` writes to the clipboard, reports `copied` (or `failed`)
 * and goes back to `idle` after `COPIED_MS`; a second copy restarts the timer. `dispose` stops
 * the timer when the viewer closes (and may run more than once: React's strict mode).
 */
export function createCopyAction(
  write: (text: string) => Promise<void>,
  onChange: (state: CopyState) => void,
  resetMs = COPIED_MS,
): { copy: (text: string) => Promise<void>; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    async copy(text) {
      let state: CopyState;
      try {
        await write(text);
        state = 'copied';
      } catch {
        state = 'failed';
      }
      onChange(state);
      clearTimeout(timer);
      timer = setTimeout(() => onChange('idle'), resetMs);
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}

/**
 * Writes text to the clipboard: the async Clipboard API where the page is a secure context,
 * else the old hidden-textarea `execCommand('copy')`, because a self-hosted MyTube is often
 * opened over plain http on the LAN, where `navigator.clipboard` does not exist. A refused
 * Clipboard API write falls back to the old way too.
 */
export async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Refused (no focus, a permission policy): try the old way below.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  const focused = document.activeElement;
  document.body.append(area);
  area.select();
  // oxlint-disable-next-line typescript/no-deprecated -- the only copy without a secure context
  const ok = document.execCommand('copy');
  area.remove();
  if (focused instanceof HTMLElement) focused.focus();
  if (!ok) throw new Error('Copy was refused');
}
