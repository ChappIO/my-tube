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
import { SettingsTab } from './SettingsTab';

const audioOptions = optionsOf(AUDIO_QUALITIES, qualityLabel);
const containerOptions = optionsOf(AUDIO_CONTAINERS);

/** Error message for a music folder structure that cannot be saved (unknown tags, `..`). */
export function validateMusicTemplate(template: string): string | undefined {
  return schemaError(MusicSettingsSchema.shape.pathTemplate, template);
}

/** Settings → Music: Library, Format and Behaviour. Every change saves immediately. */
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
              description="Artist, album, track number, year."
              checked={music.embedCoverArt}
              onChange={(embedCoverArt) => save({ embedCoverArt })}
            />
            <ToggleRow
              label="Skip live recordings"
              description={'Ignore tracks whose title contains "live".'}
              checked={music.skipLiveRecordings}
              onChange={(skipLiveRecordings) => save({ skipLiveRecordings })}
            />
          </SettingsCard>
        </>
      )}
    </SettingsTab>
  );
}
