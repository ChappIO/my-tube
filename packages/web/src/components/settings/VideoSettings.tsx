import {
  VIDEO_PATH_TAGS,
  VIDEO_CONTAINERS,
  VIDEO_QUALITIES,
  VideoSettings as VideoSettingsSchema,
  type VideoSettings as VideoSettingsValue,
} from '@mytube/shared';
import { useUpdateSettings } from '../../api/settings';
import { useMaintenanceStatus, useSystemInfo } from '../../api/system';
import { librarySizeText } from '../../format';
import { KeyValueGrid, KeyValueRow } from '../ui/KeyValueGrid';
import { Select } from '../ui/Select';
import { SettingsCard } from '../ui/SettingsCard';
import { ToggleRow } from '../ui/Toggle';
import { LibraryCard } from './LibraryCard';
import { optionsOf, qualityLabel, schemaError } from './fields';
import { SettingsTab } from './SettingsTab';
import { DefaultRulesEditor } from './DefaultRulesEditor';
import { AutoSubtitlesRow, SubtitlesControl } from './VideoControls';

const qualityOptions = optionsOf(VIDEO_QUALITIES, qualityLabel);
const containerOptions = optionsOf(VIDEO_CONTAINERS);

/** Error message for a video folder structure that cannot be saved (unknown tags, `..`). */
export function validateVideoTemplate(template: string): string | undefined {
  return schemaError(VideoSettingsSchema.shape.pathTemplate, template);
}

/**
 * Settings → Video: Library, Format and Defaults for new channels. Every change saves
 * immediately (text on blur or Enter), except the default rules, which have their own Save. The
 * defaults apply to channels and playlists added later; existing ones keep their own rules.
 */
export function VideoSettings() {
  const update = useUpdateSettings();
  const { data: info } = useSystemInfo();
  const { data: maintenance } = useMaintenanceStatus();
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
            tags={VIDEO_PATH_TAGS}
            tagNote="Use {tag}."
            size={
              maintenance &&
              librarySizeText(maintenance.libraries.video, maintenance.rescan.lastAt, 'video')
            }
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
              <KeyValueRow label="Subtitles" align="start">
                <SubtitlesControl
                  languages={video.subtitleLanguages}
                  embedded={video.subtitlesEmbedded}
                  onChange={save}
                />
              </KeyValueRow>
            </KeyValueGrid>
            <AutoSubtitlesRow
              checked={video.autoSubtitles}
              disabled={video.subtitleLanguages.length === 0}
              onChange={save}
            />
          </SettingsCard>
          <SettingsCard title="Defaults for new channels">
            <DefaultRulesEditor
              value={video.defaultRules}
              onSave={(defaultRules) => save({ defaultRules })}
              appliesTo="channels and playlists"
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
