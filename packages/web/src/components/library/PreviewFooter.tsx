import { Button } from '../ui/Button';
import { Meta } from '../ui/typography';

export interface PreviewFooterProps {
  title: string;
  /** The file path relative to the video library, or null when it is not on disk. */
  path: string | null;
  /** A muted line under the path, such as the mkv note. */
  note?: string;
  /** Opens the Delete file confirmation; omitted when there is no file. */
  onDelete?: () => void;
}

/**
 * The Preview footer: 22px 26px, the title (Archivo 700 18) over the file
 * path (Space Mono 12 muted) on the left and the outlined **Delete file** pill on the right.
 * There is no "Open in Plex" (architecture skill, settled decisions).
 */
export function PreviewFooter({ title, path, note, onDelete }: PreviewFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-5 px-[26px] py-[22px]">
      <div className="min-w-0">
        <div className="font-sans text-[18px] font-bold break-words">{title}</div>
        {path && (
          <Meta as="div" className="mt-1 break-all">
            {path}
          </Meta>
        )}
        {note && (
          <Meta as="div" className="mt-1">
            {note}
          </Meta>
        )}
      </div>
      {onDelete && (
        <Button variant="outlined" size="lg" onClick={onDelete}>
          Delete file
        </Button>
      )}
    </div>
  );
}
