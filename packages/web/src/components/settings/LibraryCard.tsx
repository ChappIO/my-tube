import { KeyValueGrid, KeyValueRow, KeyValueText } from '../ui/KeyValueGrid';
import { SettingsCard, SettingsNote } from '../ui/SettingsCard';
import { TextValueInput } from '../ui/TextValueInput';

export interface LibraryCardProps {
  /** The library mount from `GET /api/system/info`; undefined while it loads. */
  path: string | undefined;
  /** `music.pathTemplate` or `video.pathTemplate`. */
  pathTemplate: string;
  onPathTemplateChange: (template: string) => void;
  /** Error message for a template that cannot be saved. */
  validatePathTemplate: (template: string) => string | undefined;
}

/**
 * Settings → Music / Video → Library: the mount path (read-only, from env), the folder
 * structure template (editable, saves on blur or Enter) and the library size. The size is a
 * placeholder until the library index exists (Stage 6 for music, Stage 5 for video).
 */
export function LibraryCard({
  path,
  pathTemplate,
  onPathTemplateChange,
  validatePathTemplate,
}: LibraryCardProps) {
  return (
    <SettingsCard title="Library">
      <KeyValueGrid>
        <KeyValueRow label="Path" control={false}>
          <KeyValueText>{path ?? '…'}</KeyValueText>
        </KeyValueRow>
        <KeyValueRow label="Folder structure">
          <TextValueInput
            value={pathTemplate}
            onCommit={onPathTemplateChange}
            validate={validatePathTemplate}
          />
        </KeyValueRow>
        <KeyValueRow label="Size" control={false}>
          <KeyValueText>— · —</KeyValueText>
        </KeyValueRow>
      </KeyValueGrid>
      <SettingsNote size="small">
        Braces mark placeholders, / separates folders. Size is counted once the library is indexed.
      </SettingsNote>
    </SettingsCard>
  );
}
