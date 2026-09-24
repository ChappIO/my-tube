import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../icons';
import { cx } from './cx';
import { IconButton } from './IconButton';
import { ModalTitle } from './typography';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** `default` overlay at 0.45 (Add to library), `strong` at 0.7 (Preview). */
  dim?: 'default' | 'strong';
  /** CSS width of the dialog. Default `min(560px, 100%)`. */
  width?: string;
  children: ReactNode;
}

// The overlay is the light-theme ink at fixed opacity in both themes (handoff Screens 4 and 7).
const overlays = {
  default: 'bg-[rgba(21,22,24,0.45)]',
  strong: 'bg-[rgba(21,22,24,0.7)]',
} as const;

/**
 * Modal frame: dimmed overlay, centered dialog (radius 18, padding 28, gap 22, modal shadow)
 * with a title row and a round close button. Closes on overlay click and Escape, locks page
 * scroll while open and moves focus into the dialog, restoring it on close.
 */
export function Modal({
  open,
  onClose,
  title,
  dim = 'default',
  width = 'min(560px, 100%)',
  children,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the open effect when the parent re-renders.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-10 grid place-items-center overflow-y-auto p-6',
        overlays[dim],
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="grid gap-[22px] rounded-modal bg-bg p-7 text-ink shadow-modal outline-none"
        style={{ width }}
      >
        <div className="flex items-center justify-between gap-4">
          <ModalTitle id={titleId}>{title}</ModalTitle>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Modal footer: right-aligned buttons, gap 10, 4px extra space above. */
export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-[10px] pt-1">{children}</div>;
}
