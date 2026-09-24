import type { ComponentProps, ReactNode } from 'react';
import { cx, focusRing, hitArea } from './cx';

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonTone = 'surface' | 'red';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  /** Accessible name; the button shows only an icon. */
  label: string;
  /** 32px (`sm`, modal close), 36px (`md`, default) or 40px (`lg`, narrow top bar "+"). */
  size?: IconButtonSize;
  /** `surface` fill with ink glyph (default) or `red` fill with white glyph. */
  tone?: IconButtonTone;
  /** An icon from `components/icons`. */
  children: ReactNode;
}

const sizes: Record<IconButtonSize, string> = {
  sm: 'size-8',
  md: 'size-9',
  lg: 'size-10',
};

const tones: Record<IconButtonTone, string> = {
  surface: 'bg-surface text-ink',
  red: 'bg-red text-white',
};

/** Round icon button. The hit area grows to 44px on narrow screens without changing its look. */
export function IconButton({
  label,
  size = 'md',
  tone = 'surface',
  type = 'button',
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-grid shrink-0 cursor-pointer place-items-center rounded-full disabled:cursor-default disabled:opacity-50',
        hitArea,
        focusRing,
        sizes[size],
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
