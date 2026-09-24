import {
  VIDEO_CONTAINERS,
  VIDEO_QUALITIES,
  VideoSettings as VideoSettingsSchema,
  type VideoSettings as VideoSettingsValue,
} from '@mytube/shared';
import { useUpdateSettings } from '../../api/settings';
import { useSystemInfo } from '../../api/system';
import { KeyValueGrid, KeyValueRow } from '../ui/KeyValueGrid';
import { Select } from '../ui/Select';
import { SettingsCard } from '../ui/SettingsCard';
import { ToggleRow } from '../ui/Toggle';
import { LibraryCard } from './LibraryCard';
import { optionsOf, qualityLabel, schemaError } from './fields';
import { SettingsTab } from './SettingsTab';
import { KeepDaysControl, SubtitlesControl } from './VideoControls';

const qualityOptions = optionsOf(VIDEO_QUALITIES, qualityLabel);
const containerOptions = optionsOf(VIDEO_CONTAINERS);

/** Error message for a video folder structure that cannot be saved. */
export function validateVideoTemplate(template: string): string | undefined {
  if (template === '') return 'Enter a folder structure.';
  return schemaError(VideoSettingsSchema.shape.pathTemplate, template);
}

/**
 * Settings → Video: Library, Format and Defaults for new channels. Every change saves
 * immediately (text on blur or Enter). The defaults apply to channels added later; existing
 * subscriptions keep their own rules.
 */
export function VideoSettings() {
  const update = useUpdateSettings();
  const { data: info } = useSystemInfo();
  const save = (patch: Partial<VideoSettingsValue>) => update.mutate({ video: patch });
  return (
    <SettingsTab saveFailed={update.isError}>
      {({ video }) => (
        <>
          <LibraryCard
            path={info?.videoDir}
            pathTemplate={video.pathTemplate}
            onPathTemplateChange={(pathTemplate) => save({ pathTemplate })}
            validatePathTemplate={validateVideoTemplate}
          />
          <SettingsCard title="Format">
            <KeyValueGrid>
              <KeyValueRow label="Quality">
                <Select
                  options={qualityOptions}
                  value={video.quality}
                  onChange={(quality) => save({ quality })}
                />
              </KeyValueRow>
              <KeyValueRow label="Container">
                <Select
                  options={containerOptions}
                  value={video.container}
                  onChange={(container) => save({ container })}
                />
              </KeyValueRow>
              <KeyValueRow label="Subtitles">
                <SubtitlesControl
                  languages={video.subtitleLanguages}
                  embedded={video.subtitlesEmbedded}
                  onChange={save}
                />
              </KeyValueRow>
            </KeyValueGrid>
          </SettingsCard>
          <SettingsCard title="Defaults for new channels">
            <KeyValueGrid>
              <KeyValueRow label="Keep videos for">
                <KeepDaysControl
                  value={video.keepDays}
                  onChange={(keepDays) => save({ keepDays })}
                />
              </KeyValueRow>
            </KeyValueGrid>
            <ToggleRow
              label="Skip shorts"
              description="Anything under 60 seconds or in the Shorts shelf."
              checked={video.skipShorts}
              onChange={(skipShorts) => save({ skipShorts })}
            />
            <ToggleRow
              label="Save thumbnails"
              description="As a sidecar file, for Plex."
              checked={video.saveThumbnails}
              onChange={(saveThumbnails) => save({ saveThumbnails })}
            />
          </SettingsCard>
        </>
      )}
    </SettingsTab>
  );
}
