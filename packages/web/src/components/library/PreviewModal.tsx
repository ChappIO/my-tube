import { type ReactNode, useState } from 'react';
import { ApiError, apiErrorMessage } from '../../api/client';
import { useDeleteVideoFile, useVideo } from '../../api/library';
import type { PreviewTarget } from '../../ui-state';
import { StatusLine } from '../sources/SourceBits';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import { Body } from '../ui/typography';
import { PreviewFooter } from './PreviewFooter';
import { PreviewPlayer, canPlayInBrowser } from './PreviewPlayer';

/** As wide as fits 880px, the screen, and a 16/9 player 160px shorter than it. */
const PREVIEW_WIDTH = 'min(880px, 100%, calc((100vh - 160px) * 16 / 9))';
const PREVIEW_MAX_HEIGHT = 'calc(100vh - 48px)';

export const MKV_NOTE = 'This container cannot play in the browser. Plex plays it.';

/**
 * Preview of a video, opened from a video tile through `openPreview(id)` and rendered by
 * `AppShell`: the header-less `Modal` on the strong scrim, the 16/9 player and the footer with
 * **Delete file**. Click outside or Escape closes it (playback stops with it). Music plays in the
 * player instead; the video player replaces Preview next.
 */
export function PreviewModal({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  return <VideoPreview id={target.id} onClose={onClose} />;
}

function PreviewFrame({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      aria-label={label}
      dim="strong"
      width={PREVIEW_WIDTH}
      maxHeight={PREVIEW_MAX_HEIGHT}
    >
      {children}
    </Modal>
  );
}

function VideoPreview({ id, onClose }: { id: number; onClose: () => void }) {
  const video = useVideo(id);
  const remove = useDeleteVideoFile();
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
    <PreviewFrame label={item ? `Preview: ${item.title}` : 'Preview'} onClose={onClose}>
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
          title={item.title}
          pending={remove.isPending}
          error={
            remove.isError ? apiErrorMessage(remove.error, 'Could not delete the file.') : undefined
          }
          onClose={() => setConfirming(false)}
          onConfirm={() =>
            remove.mutate(item.id, {
              onSuccess: () => {
                setConfirming(false);
                onClose();
              },
            })
          }
        />
      )}
    </PreviewFrame>
  );
}

/**
 * Confirms Delete file: the media file and its sidecars go, the item stays known as deleted
 * (it is never downloaded again on its own). The grids refresh once it is done.
 */
function DeleteFileModal({
  title,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  pending: boolean;
  error: string | undefined;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={`Delete ${title}?`} width="min(460px, 100%)">
      <Body>The file and its sidecars are removed from disk. The item stays known as deleted.</Body>
      <div className="grid gap-2">
        <StatusLine>{error}</StatusLine>
        <ModalActions>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" disabled={pending} onClick={onConfirm}>
            {pending ? 'Deleting…' : 'Delete file'}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}
