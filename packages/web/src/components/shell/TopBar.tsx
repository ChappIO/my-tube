import { LogoLockup } from '../brand/Logo';
import { PlusIcon } from '../icons';
import { IconButton } from '../ui/IconButton';

/** Narrow layout top bar: sticky, lockup left, round red Add button right. Hidden at 760px and up. */
export function TopBar({ onAdd }: { onAdd: () => void }) {
  return (
    <header className="sticky top-0 z-[5] -mb-2 flex items-center justify-between gap-3 bg-bg py-3 wide:hidden">
      <LogoLockup />
      <IconButton tone="red" size="lg" label="Add to library" onClick={onAdd}>
        <PlusIcon size={20} />
      </IconButton>
    </header>
  );
}
