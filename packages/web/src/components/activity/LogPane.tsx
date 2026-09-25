import { Fragment, type ReactNode, useLayoutEffect, useMemo, useRef } from 'react';
import { cx, focusRingInset } from '../ui/cx';
import { isAtBottom, splitTimestamp } from './job-log';

export interface LogPaneProps {
  /** The log text to show (already cut to the viewer's limit). */
  text: string;
  /** Long lines wrap; otherwise one line per line and the pane scrolls sideways. */
  wrap: boolean;
  /** Keep the newest line in view: the pane scrolls to the bottom on every change. */
  autoScroll: boolean;
  /** The reader scrolled; whether the pane is now at the bottom. */
  onScrolled: (atBottom: boolean) => void;
  /** Accessible name: `Log of <title>`. */
  label: string;
  /** A line in place of the log: "Loading the log.", "No log yet.", … */
  status?: string | null;
  /** The `LogToolbar`, fused to the top of the block. */
  toolbar: ReactNode;
}

const bodyClass = 'min-h-0 flex-1 px-[14px] py-3 font-mono text-[12px] leading-[1.5]';

/**
 * The log block, built like a tile with a fixed chin turned upside down: one `surface` box,
 * radius 12, `overflow: hidden`, filling the rest of the viewer (at least 320px). The toolbar
 * is its top part (with the `line` divider) and stays put; below it the log, a `<pre>` in Space
 * Mono 12 scrolling on both axes. No wrapping by default (`whitespace-pre`); with `wrap` long
 * lines wrap anywhere. The `HH:MM:SS.mmm` prefix of each line is muted.
 */
export function LogPane({
  text,
  wrap,
  autoScroll,
  onScrolled,
  label,
  status,
  toolbar,
}: LogPaneProps) {
  const ref = useRef<HTMLPreElement>(null);
  const lines = useMemo(() => text.split('\n').map(splitTimestamp), [text]);

  // New text, a wrap change or auto-scroll switched on move the bottom: follow it while
  // auto-scrolling. Only on those changes: an unrelated render (the header's clock) must not
  // pull the pane down before the reader's scroll up has been reported.
  const last = useRef<{ text: string; wrap: boolean; autoScroll: boolean } | null>(null);
  useLayoutEffect(() => {
    const previous = last.current;
    last.current = { text, wrap, autoScroll };
    const changed =
      previous === null ||
      previous.text !== text ||
      previous.wrap !== wrap ||
      previous.autoScroll !== autoScroll;
    const element = ref.current;
    if (element && autoScroll && changed) element.scrollTop = element.scrollHeight;
  });

  return (
    <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-tile bg-surface">
      {toolbar}
      {status ? (
        <div role="status" className={cx(bodyClass, 'text-muted')}>
          {status}
        </div>
      ) : (
        <pre
          ref={ref}
          tabIndex={0}
          aria-label={label}
          onScroll={(event) => {
            const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
            onScrolled(isAtBottom(scrollTop, clientHeight, scrollHeight));
          }}
          className={cx(
            bodyClass,
            'overflow-auto text-ink',
            focusRingInset,
            wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre',
          )}
        >
          {lines.map((line, index) => (
            // Lines never move: the log only grows at the end.
            // oxlint-disable-next-line react/no-array-index-key
            <Fragment key={index}>
              {line.time && <span className="text-muted">{line.time}</span>}
              {line.rest}
              {index < lines.length - 1 && '\n'}
            </Fragment>
          ))}
        </pre>
      )}
    </div>
  );
}
