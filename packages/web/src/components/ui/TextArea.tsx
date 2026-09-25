import type { ComponentProps } from 'react';
import { cx, focusRing } from './cx';

export interface TextAreaProps extends ComponentProps<'textarea'> {
  /** Space Mono 12 for file contents (the pasted cookies file); Archivo 14 otherwise. */
  mono?: boolean;
}

/**
 * Multi-line text field: the `field` input's look (`surface` fill, 1px `line` border,
 * radius 10, 13px 14px), full width, resizable vertically only.
 */
export function TextArea({ mono, className, ...props }: TextAreaProps) {
  return (
    <textarea
      spellCheck={false}
      className={cx(
        'box-border block w-full resize-y rounded-nav border border-line bg-surface px-[14px] py-[13px] font-normal text-ink placeholder:text-muted',
        mono ? 'font-mono text-[12px] [overflow-wrap:anywhere]' : 'font-sans text-[14px]',
        focusRing,
        className,
      )}
      {...props}
    />
  );
}
