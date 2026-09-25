import type { QueueTone } from '../../format';
import { cx } from '../ui/cx';

export interface QueueStateProps {
  /** `downloading 64%`, `processing · merging`, `queued`, … (see `queueState`). */
  text: string;
  tone: QueueTone;
}

/**
 * The queue row's state column: Space Mono 700 13, red or muted. On narrow screens it wraps
 * within 16 characters (`processing · converting thumbnail` would otherwise leave the title no
 * room); wide screens keep it on one line.
 */
export function QueueState({ text, tone }: QueueStateProps) {
  return (
    <span
      className={cx(
        'max-w-[16ch] text-right font-mono text-[13px] font-bold wide:max-w-none wide:whitespace-nowrap',
        tone === 'red' ? 'text-red' : 'text-muted',
      )}
    >
      {text}
    </span>
  );
}
