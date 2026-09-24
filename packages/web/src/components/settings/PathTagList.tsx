import type { PathTag } from '@mytube/shared';

export interface PathTagListProps {
  /** `MUSIC_PATH_TAGS` or `VIDEO_PATH_TAGS` from shared; never a list of its own. */
  tags: readonly PathTag[];
  /** Muted line after the chips ("Use {tag}; {track:02} pads numbers."). */
  note: string;
}

/**
 * The supported folder structure tags under a Folder structure field: one wrapped row of small
 * Space Mono chips (`surface`, radius 6), each with its description as a hover title and as
 * screen reader text, followed by a short muted note.
 */
export function PathTagList({ tags, note }: PathTagListProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-[6px]">
      <ul aria-label="Supported tags" className="flex flex-wrap gap-[6px]">
        {tags.map(({ tag, description }) => (
          <li
            key={tag}
            title={description}
            className="cursor-help rounded-chip bg-surface px-[6px] py-[2px] text-meta text-ink"
          >
            {`{${tag}}`}
            <span className="sr-only">: {description}</span>
          </li>
        ))}
      </ul>
      <span className="font-sans text-[12px] font-normal text-muted">{note}</span>
    </div>
  );
}
