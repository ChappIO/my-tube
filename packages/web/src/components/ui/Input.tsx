import type { ComponentProps } from 'react';
import { cx, focusRing, minHit } from './cx';

export type InputShape = 'pill' | 'field';

export interface InputProps extends Omit<ComponentProps<'input'>, 'width' | 'size'> {
  /** `pill` for search and filter (10px 14px), `field` radius 10 for forms (13px 14px). */
  shape?: InputShape;
  /** Space Mono for URLs and paths; Archivo otherwise. */
  mono?: boolean;
  /** CSS width, capped at the container ("300px", 300). Defaults to full width. */
  width?: string | number;
}

const shapes: Record<InputShape, string> = {
  pill: 'rounded-pill py-[10px] px-[14px]',
  field: 'rounded-nav py-[13px] px-[14px]',
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
        'box-border max-w-full border border-line bg-surface text-[14px] font-normal text-ink placeholder:text-muted',
        mono ? 'font-mono' : 'font-sans',
        width === undefined && 'w-full',
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
