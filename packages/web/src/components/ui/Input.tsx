import type { ComponentProps } from 'react';
import { cx, focusRing, minHit, valueBox } from './cx';

export type InputShape = 'pill' | 'field' | 'value';

export interface InputProps extends Omit<ComponentProps<'input'>, 'width' | 'size'> {
  /**
   * `pill` for search and filter (10px 14px), `field` radius 10 for forms (13px 14px), `value`
   * for a Settings key/value grid (the `surface` value box: Space Mono 13, 9px 12px, radius 8,
   * no border, at least 160px wide, full width on narrow).
   */
  shape?: InputShape;
  /** Space Mono for URLs and paths; Archivo otherwise. Always on for `value`. */
  mono?: boolean;
  /** CSS width, capped at the container ("300px", 300). Defaults to full width (`value`: see shape). */
  width?: string | number;
}

const shapes: Record<InputShape, string> = {
  pill: 'rounded-pill py-[10px] px-[14px]',
  field: 'rounded-nav py-[13px] px-[14px]',
  value: '',
};

/** Text input from the handoff's Inputs section. */
export function Input({
  shape = 'field',
  mono,
  width,
  type = 'text',
  className,
  style,
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      className={cx(
        'max-w-full placeholder:text-muted',
        shape === 'value'
          ? valueBox
          : cx(
              'box-border border border-line bg-surface text-[14px] font-normal text-ink',
              mono ? 'font-mono' : 'font-sans',
              width === undefined && 'w-full',
            ),
        minHit,
        focusRing,
        shapes[shape],
        className,
      )}
      style={width === undefined ? style : { width, ...style }}
      {...props}
    />
  );
}
