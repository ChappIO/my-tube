import type { PathTag } from '@mytube/shared';
import { KeyValueGrid, KeyValueRow, KeyValueText } from '../ui/KeyValueGrid';
import { SettingsCard, SettingsNote } from '../ui/SettingsCard';
import { TextValueInput } from '../ui/TextValueInput';
import { PathTagList } from './PathTagList';

export interface LibraryCardProps {
  /** The library mount from `GET /api/system/info`; undefined while it loads. */
  path: string | undefined;
  /** `music.pathTemplate` or `video.pathTemplate`. */
  pathTemplate: string;
  onPathTemplateChange: (template: string) => void;
  /** Error message for a template that cannot be saved (the shared schema's message). */
  validatePathTemplate: (template: string) => string | undefined;
  /** The library's tags (`MUSIC_PATH_TAGS`, `VIDEO_PATH_TAGS`), listed under the field. */
  tags: readonly PathTag[];
  /** Muted note after the tag chips. */
  tagNote: string;
}

/**
 * Settings → Music / Video → Library: the mount path (read-only, from env), the folder
 * structure template (editable, saves on blur or Enter) with its supported tags under it, and
 * the library size. The size is a placeholder until the library index exists (Stage 5 for
 * video, Stage 6 for music; the Stage 7 rescan fills it).
 */
export function LibraryCard({
  path,
  pathTemplate,
  onPathTemplateChange,
  validatePathTemplate,
  tags,
  tagNote,
}: LibraryCardProps) {
  return (
    <SettingsCard title="Library">
      <KeyValueGrid>
        <KeyValueRow label="Path" control={false}>
          <KeyValueText>{path ?? '…'}</KeyValueText>
        </KeyValueRow>
        <KeyValueRow label="Folder structure" align="start">
          <div className="grid gap-2">
            <TextValueInput
              value={pathTemplate}
              onCommit={onPathTemplateChange}
              validate={validatePathTemplate}
            />
            <PathTagList tags={tags} note={tagNote} />
          </div>
        </KeyValueRow>
        <KeyValueRow label="Size" control={false}>
          <KeyValueText>— · —</KeyValueText>
        </KeyValueRow>
      </KeyValueGrid>
      <SettingsNote size="small">Size is counted once the library is indexed.</SettingsNote>
    </SettingsCard>
  );
}
