/**
 * Type roles from the handoff's Typography table as components, so screens never repeat the
 * type utilities. Each sets the role and, where the handoff says so, the muted color.
 */
import type { ElementType, ReactNode } from 'react';
import { cx } from './cx';

interface TextProps {
  children: ReactNode;
  /** Element to render. Each role has a sensible default. */
  as?: ElementType;
  id?: string;
  /** Layout placement only (margins, grid placement). */
  className?: string;
}

/** Page title (h1): Archivo 800, 32px, 26px on narrow. */
export function PageTitle({ as: Tag = 'h1', className, ...props }: TextProps) {
  return <Tag className={cx('text-h1', className)} {...props} />;
}

/** Modal title: Archivo 800, 22px. */
export function ModalTitle({ as: Tag = 'h2', className, ...props }: TextProps) {
  return <Tag className={cx('text-modal-title', className)} {...props} />;
}

/** Section and card title: Archivo 700, 17px. */
export function SectionTitle({ as: Tag = 'h2', className, ...props }: TextProps) {
  return <Tag className={cx('text-section-title', className)} {...props} />;
}

/** Section label: Space Mono 700, 12px, uppercase, muted ("Today", "Recent"). */
export function SectionLabel({ as: Tag = 'h2', className, ...props }: TextProps) {
  return <Tag className={cx('text-section-label text-muted', className)} {...props} />;
}

/** Table header label: Space Mono 700, 11px, uppercase, muted. */
export function TableHeaderLabel({ as: Tag = 'span', className, ...props }: TextProps) {
  return <Tag className={cx('text-table-header text-muted', className)} {...props} />;
}

export type MetaTone = 'muted' | 'ink' | 'ok' | 'red';

const metaTones: Record<MetaTone, string> = {
  muted: 'text-muted',
  ink: 'text-ink',
  ok: 'text-ok',
  red: 'text-red',
};

interface MetaProps extends TextProps {
  /** `md` is 12px (default), `sm` 11px. */
  size?: 'md' | 'sm';
  /** Muted by default; `ok` for "on disk" and "done", `red` for missing counts. */
  tone?: MetaTone;
}

/** Meta line: Space Mono 400 for durations, paths, counts and timestamps. */
export function Meta({
  as: Tag = 'span',
  size = 'md',
  tone = 'muted',
  className,
  ...props
}: MetaProps) {
  return (
    <Tag
      className={cx(size === 'sm' ? 'text-meta-sm' : 'text-meta', metaTones[tone], className)}
      {...props}
    />
  );
}

interface BodyProps extends TextProps {
  /** Secondary text (page header subtitle, empty states). */
  muted?: boolean;
}

/** Body text: Archivo 400, 14px. */
export function Body({ as: Tag = 'p', muted, className, ...props }: BodyProps) {
  return <Tag className={cx('text-body', muted && 'text-muted', className)} {...props} />;
}

interface FieldLabelProps extends TextProps {
  /** Id of the input this labels. Use `as="div"` for a label over a group instead. */
  htmlFor?: string;
}

/** Form field label: Archivo 600, 13px, muted ("Paste a YouTube link", "Rules"). */
export function FieldLabel({ as: Tag = 'label', className, ...props }: FieldLabelProps) {
  return (
    <Tag className={cx('font-sans text-[13px] font-semibold text-muted', className)} {...props} />
  );
}
