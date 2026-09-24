import { PlusIcon } from '../icons';
import { cx, focusRing } from '../ui/cx';

/**
 * Sidebar "+ Add to library": full width red pill, Archivo 700 15px, 13px padding.
 * Local rather than `ui/Button` because Button's sizes (13px and 14px text) do not
 * match this one-off spec.
 */
export function AddToLibraryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full cursor-pointer items-center justify-center gap-2 rounded-pill bg-red p-[13px] font-sans text-[15px] font-bold text-white',
        focusRing,
      )}
    >
      <PlusIcon />
      Add to library
    </button>
  );
}
