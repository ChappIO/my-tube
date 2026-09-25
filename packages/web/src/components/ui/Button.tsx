import type { ComponentProps, ReactNode } from 'react';
import { cx, focusRing, minHit } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'outlined';
export type ButtonSize = 'md' | 'lg' | 'xl';

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** `primary` red, `secondary` surface, `outlined` 1px line border. Default `secondary`. */
  variant?: ButtonVariant;
  /**
   * `md`: Archivo 13, 9px 16px ("Edit rules"). `lg`: Archivo 14, 11px 18–20px (modal footer).
   * `xl`: Archivo 700 15, 13px all round (sidebar "Add to library"; pair with `fullWidth`).
   */
  size?: ButtonSize;
  /** Leading icon from `components/icons`, 8px before the label. */
  icon?: ReactNode;
  /** Stretch to the container width (sidebar "Add to library", with `size="xl"`). */
  fullWidth?: boolean;
  /**
   * Makes the button a toggle (`aria-pressed`): pressed outlined buttons get an `ink` border,
   * like the active sort pill (the log viewer's Wrap and Auto-scroll).
   */
  pressed?: boolean;
  children: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-red text-white border-red',
  secondary: 'bg-surface text-ink border-surface',
  outlined: 'bg-transparent text-ink border-line hover:bg-surface',
};

// A pressed outlined toggle: the active sort pill's `ink` border.
const pressedOutlined = 'bg-transparent text-ink border-ink hover:bg-surface';

// Padding includes the 1px border every variant carries, so all three line up.
const sizes: Record<ButtonSize, string> = {
  md: 'text-[13px] py-2 px-[15px]',
  lg: 'text-[14px] py-[10px] px-[17px]',
  xl: 'text-[15px] p-3',
};

/** Pill button: primary (red), secondary (`surface`) or outlined. */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  fullWidth,
  pressed,
  type = 'button',
  className,
  children,
  ...props
}: ButtonProps) {
  // Primary on the large size is Archivo 700 with 20px sides, like the modal's Subscribe.
  // The extra-large size is always Archivo 700.
  const heavy = variant === 'primary' && size === 'lg';
  return (
    <button
      type={type}
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill border font-sans whitespace-nowrap disabled:cursor-default disabled:opacity-50',
        minHit,
        focusRing,
        pressed && variant === 'outlined' ? pressedOutlined : variants[variant],
        sizes[size],
        heavy && 'px-[19px]',
        heavy || size === 'xl' ? 'font-bold' : 'font-semibold',
        fullWidth && 'w-full',
        className,
      )}
      aria-pressed={pressed}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
