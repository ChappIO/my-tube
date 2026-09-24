import {
  MUSIC_PATH_TAGS,
  AUDIO_CONTAINERS,
  AUDIO_QUALITIES,
  MusicSettings as MusicSettingsSchema,
  type MusicSettings as MusicSettingsValue,
} from '@mytube/shared';
import { useUpdateSettings } from '../../api/settings';
import { useSystemInfo } from '../../api/system';
import { KeyValueGrid, KeyValueRow } from '../ui/KeyValueGrid';
import { Select } from '../ui/Select';
import { SettingsCard } from '../ui/SettingsCard';
import { ToggleRow } from '../ui/Toggle';
import { LibraryCard } from './LibraryCard';
import { ON_OFF_OPTIONS, optionsOf, qualityLabel, schemaError } from './fields';
import { DefaultRulesEditor } from './DefaultRulesEditor';
import { SettingsTab } from './SettingsTab';

const audioOptions = optionsOf(AUDIO_QUALITIES, qualityLabel);
const containerOptions = optionsOf(AUDIO_CONTAINERS);

/** Error message for a music folder structure that cannot be saved (unknown tags, `..`). */
export function validateMusicTemplate(template: string): string | undefined {
  return schemaError(MusicSettingsSchema.shape.pathTemplate, template);
}

/**
 * Settings → Music: Library, Format, Behaviour and Defaults for new artists. Every change saves
 * immediately, except the default rules, which have their own Save.
 */
export function MusicSettings() {
  const update = useUpdateSettings();
  const { data: info } = useSystemInfo();
  const save = (patch: Partial<MusicSettingsValue>) => update.mutate({ music: patch });
  return (
    <SettingsTab saveFailed={update.isError}>
      {({ music }) => (
        <>
          <LibraryCard
            path={info?.musicDir}
            pathTemplate={music.pathTemplate}
            onPathTemplateChange={(pathTemplate) => save({ pathTemplate })}
            validatePathTemplate={validateMusicTemplate}
            tags={MUSIC_PATH_TAGS}
            tagNote="Use {tag}; {track:02} pads numbers."
          />
          <SettingsCard title="Format">
            <KeyValueGrid>
              <KeyValueRow label="Audio">
                <Select
                  options={audioOptions}
                  value={music.audioQuality}
                  onChange={(audioQuality) => save({ audioQuality })}
                />
              </KeyValueRow>
              <KeyValueRow label="Container">
                <Select
                  options={containerOptions}
                  value={music.container}
                  onChange={(container) => save({ container })}
                />
              </KeyValueRow>
              <KeyValueRow label="Loudness normalization">
                <Select
                  options={ON_OFF_OPTIONS}
                  value={music.loudnessNormalization ? 'on' : 'off'}
                  onChange={(choice) => save({ loudnessNormalization: choice === 'on' })}
                />
              </KeyValueRow>
            </KeyValueGrid>
          </SettingsCard>
          <SettingsCard title="Behaviour">
            <ToggleRow
              label="Embed cover art and tags"
              description="Artist, album, track number, year. The default for new artists."
              checked={music.embedCoverArt}
              onChange={(embedCoverArt) => save({ embedCoverArt })}
            />
          </SettingsCard>
          <SettingsCard title="Defaults for new artists">
            <DefaultRulesEditor
              value={music.defaultRules}
              onSave={(defaultRules) => save({ defaultRules })}
              appliesTo="artists and playlists"
            />
          </SettingsCard>
        </>
      )}
    </SettingsTab>
  );
}
