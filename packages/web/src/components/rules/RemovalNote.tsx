import type { RulesPreview } from '@mytube/shared';
import { ChevronDownIcon } from '../icons';
import { Body, Meta } from '../ui/typography';

/** `1 file`, `3 files`. */
export const countFiles = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

/** `1 file stays`, `3 files stay`. */
const staying = (n: number) => `${countFiles(n)} ${n === 1 ? 'stays' : 'stay'}`;

/**
 * "This will remove N files." with the titles in a collapsed list, or the plain "Nothing on
 * disk is removed." when the new rules keep every file.
 */
export function RemovalNote({ preview }: { preview: RulesPreview }) {
  const count = preview.wouldRemove.length;
  if (count === 0) {
    return (
      <div role="status">
        <Body muted>
          Nothing on disk is removed
          {preview.wouldKeep > 0 ? `; ${staying(preview.wouldKeep)}` : ''}.
        </Body>
      </div>
    );
  }
  return (
    <div role="status" className="grid gap-2 rounded-tile border border-red px-[14px] py-3">
      <Body>
        This will remove {countFiles(count)} from disk
        {preview.wouldKeep > 0 ? `; ${staying(preview.wouldKeep)}` : ''}.
      </Body>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-meta text-muted [&::-webkit-details-marker]:hidden">
          <ChevronDownIcon size={14} className="-rotate-90 group-open:rotate-0" />
          Show {count === 1 ? 'it' : `all ${count}`}
        </summary>
        <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto">
          {preview.wouldRemove.map((item) => (
            <li key={item.id} className="grid">
              <span className="truncate font-sans text-[13px]">{item.title}</span>
              <Meta size="sm">{item.failing.join(', ')}</Meta>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
