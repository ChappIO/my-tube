import type { VideoListItem } from '@mytube/shared';
import { useState } from 'react';
import { ApiError, apiErrorMessage } from '../../api/client';
import { useDeleteVideoFile, useVideo } from '../../api/library';
import { StatusLine } from '../sources/SourceBits';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import { Body } from '../ui/typography';
import { PreviewFooter } from './PreviewFooter';
import { PreviewPlayer, canPlayInBrowser } from './PreviewPlayer';

/** Handoff Screen 7: as wide as fits 880px, the screen, and a 16/9 player 160px shorter than it. */
const PREVIEW_WIDTH = 'min(880px, 100%, calc((100vh - 160px) * 16 / 9))';
const PREVIEW_MAX_HEIGHT = 'calc(100vh - 48px)';

export const MKV_NOTE = 'This container cannot play in the browser. Plex plays it.';

/**
 * Preview (handoff Screen 7), opened from any tile through `openPreview(id)` and rendered by
 * `AppShell`: the header-less `Modal` on the strong scrim, the player and the footer with
 * **Delete file**. Click outside or Escape closes it (playback stops with it).
 */
export function PreviewModal({ videoId, onClose }: { videoId: number; onClose: () => void }) {
  const video = useVideo(videoId);
  const [confirming, setConfirming] = useState(false);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const item = video.data;
  const playable = !decodeFailed && canPlayInBrowser(item?.mimeType ?? null);
  const onDisk = item?.status === 'on_disk' && item.filePath !== null;

  let note: string | undefined;
  if (video.error instanceof ApiError && video.error.status === 404) {
    note = 'This video is no longer in the library.';
  } else if (video.isError) note = 'Could not load this video.';
  else if (item && !onDisk) note = 'This video is not on disk.';
  else if (item && !playable) note = MKV_NOTE;

  return (
    <Modal
      open
      onClose={onClose}
      aria-label={item ? `Preview: ${item.title}` : 'Preview'}
      dim="strong"
      width={PREVIEW_WIDTH}
      maxHeight={PREVIEW_MAX_HEIGHT}
    >
      <PreviewPlayer
        video={onDisk ? item : undefined}
        playable={playable}
        onUnplayable={() => setDecodeFailed(true)}
      />
      <PreviewFooter
        title={item?.title ?? (video.isPending ? 'Loading…' : 'Preview')}
        path={onDisk ? item.filePath : null}
        note={note}
        onDelete={onDisk ? () => setConfirming(true) : undefined}
      />
      {confirming && item && (
        <DeleteFileModal
          video={item}
          onClose={() => setConfirming(false)}
          onDeleted={() => {
            setConfirming(false);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

/**
 * Confirms Delete file: the media file and its sidecars go, the video stays known as deleted
 * (it is never downloaded again on its own). The grids refresh once it is done.
 */
function DeleteFileModal({
  video,
  onClose,
  onDeleted,
}: {
  video: VideoListItem;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteVideoFile();
  return (
    <Modal open onClose={onClose} title={`Delete ${video.title}?`} width="min(460px, 100%)">
      <Body>The file and its sidecars are removed from disk. The item stays known as deleted.</Body>
      <div className="grid gap-2">
        <StatusLine>
          {remove.isError ? apiErrorMessage(remove.error, 'Could not delete the file.') : undefined}
        </StatusLine>
        <ModalActions>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={remove.isPending}
            onClick={() => remove.mutate(video.id, { onSuccess: onDeleted })}
          >
            {remove.isPending ? 'Deleting…' : 'Delete file'}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}
