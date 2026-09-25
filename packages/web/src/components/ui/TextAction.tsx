import type { ComponentProps } from 'react';
import { cx, focusRing } from './cx';

/**
 * A small text action that opens something ("How to export cookies"): Space Mono 12,
 * underlined, ink, red on hover. The same look as the Activity screen's `ActivityLink`, for use
 * outside it. Always a button.
 */
export function TextAction({ className, type = 'button', ...props }: ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={cx(
        'cursor-pointer rounded-badge font-mono text-[12px] text-ink underline underline-offset-2 hover:text-red disabled:cursor-default disabled:opacity-50',
        focusRing,
        className,
      )}
      {...props}
    />
  );
}
