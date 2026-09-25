import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../icons';
import { cx } from './cx';
import { createLayerStack, trapTab } from './focus';
import { IconButton } from './IconButton';
import { ModalTitle } from './typography';

interface ModalBaseProps {
  open: boolean;
  onClose: () => void;
  /** `default` scrim at 0.45 (Add to library), `strong` at 0.7 with the preview shadow (Preview). */
  dim?: 'default' | 'strong';
  /** CSS width of the dialog. Default `min(560px, 100%)`. */
  width?: string;
  /** CSS max height of the dialog (Preview: `calc(100vh - 48px)`). None by default. */
  maxHeight?: string;
  /**
   * `large` (the log viewer): `min(1100px, 100vw - 32px)` by `min(85vh, 900px)` on wide screens,
   * the whole screen below 760px, a flex column the children fill. Ignores `width` and
   * `maxHeight`. Default `default`.
   */
  size?: 'default' | 'large';
  children: ReactNode;
}

interface ModalWithTitle extends ModalBaseProps {
  /** Title row: the title and a round close button. The title names the dialog. */
  title: ReactNode;
  'aria-label'?: undefined;
}

interface ModalWithoutTitle extends ModalBaseProps {
  /**
   * No title: the header-less variant (Preview). No title row, no close button and no
   * padding; the children lay out the whole dialog. `aria-label` names it instead.
   */
  title?: undefined;
  'aria-label': string;
}

export type ModalProps = ModalWithTitle | ModalWithoutTitle;

const scrims = {
  default: 'bg-scrim',
  strong: 'bg-scrim-strong',
} as const;

// Open modals, top-most last. Only the top one reacts to Escape and Tab, so a nested dialog
// closes (and traps focus) before the one below it.
const layers = createLayerStack();

/**
 * Modal frame: scrim overlay and a centered dialog (radius 18, modal shadow). With a `title`
 * it has padding 28, gap 22 and a title row with a round close button; without one it is a
 * bare frame for the Preview player. Closes on overlay click and Escape (top-most modal
 * only), locks page scroll, moves focus into the dialog, keeps Tab inside it and restores
 * focus on close.
 */
export function Modal({
  open,
  onClose,
  title,
  dim = 'default',
  width = 'min(560px, 100%)',
  maxHeight,
  size = 'default',
  children,
  'aria-label': ariaLabel,
}: ModalProps) {
  const large = size === 'large';
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headed = title !== undefined;
  // Keep the latest onClose without re-running the open effect when the parent re-renders.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const layer = layers.push();
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!layers.isTop(layer)) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      } else if (dialogRef.current) {
        trapTab(event, dialogRef.current);
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      layers.remove(layer);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-10 grid place-items-center overflow-y-auto',
        large ? 'p-0 wide:p-4' : 'p-6',
        scrims[dim],
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headed ? titleId : undefined}
        aria-label={headed ? undefined : ariaLabel}
        tabIndex={-1}
        className={cx(
          'bg-bg text-ink outline-none',
          large
            ? 'flex h-dvh w-full flex-col wide:h-[min(85vh,900px)] wide:w-[min(1100px,100%)] wide:rounded-modal'
            : 'rounded-modal',
          dim === 'strong' ? 'shadow-preview' : 'shadow-modal',
          headed ? 'grid gap-[22px] p-7' : 'overflow-hidden',
        )}
        style={large ? undefined : { width, maxHeight }}
      >
        {headed && (
          <div className="flex items-center justify-between gap-4">
            <ModalTitle id={titleId}>{title}</ModalTitle>
            <IconButton label="Close" size="sm" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </div>
        )}
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
