import { type Source, describeSource } from '@mytube/shared';
import { linkOptions, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, apiErrorMessage } from '../../api/client';
import { useDeleteSource, useSetSubscribed, useSource } from '../../api/sources';
import { checkedAgo } from '../../format';
import { useNow } from '../../use-now';
import { UnlinkIcon } from '../icons';
import { VideoGrid } from '../library/VideoGrid';
import { BellToggle } from '../media';
import { BackLink } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, fromQuery, loadFailed } from '../ui/ErrorState';
import { Modal, ModalActions } from '../ui/Modal';
import { Body, PageTitle } from '../ui/typography';
import { SUBSCRIBE_FAILED } from './ChannelsTab';
import { EditRulesModal } from './EditRulesModal';
import { RuleChips, SourceAvatar, StatusLine } from './SourceBits';
import { sourceMeta } from './source-text';

const backToChannels = linkOptions({ to: '/video/$tab', params: { tab: 'channels' } });

/**
 * The channel page: back link, header with avatar, name, meta and rule
 * chips, Edit rules and the bell pill, then the source's videos on disk as video cards without the
 * channel (title and relative date). `id` is the route param, a source id.
 */
export function ChannelPage({ id }: { id: string }) {
  const sourceId = /^\d+$/.test(id) ? Number(id) : 0;
  const source = useSource(sourceId);

  let body;
  if (sourceId === 0 || (source.error instanceof ApiError && source.error.status === 404)) {
    body = <EmptyState>This channel is not in your library.</EmptyState>;
  } else if (source.data === undefined) {
    body = loadFailed(source) ? (
      <ErrorState what="this channel" {...fromQuery(source)} />
    ) : (
      <StatusLine>Loading channel.</StatusLine>
    );
  } else {
    body = (
      <>
        <ChannelHeader source={source.data} />
        <VideoGrid filter={{ sourceId: source.data.id }} showChannel={false} />
      </>
    );
  }

  return (
    <>
      <BackLink link={backToChannels}>Video</BackLink>
      {body}
    </>
  );
}

function ChannelHeader({ source }: { source: Source }) {
  const now = useNow();
  const setSubscribed = useSetSubscribed();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  return (
    <>
      <header className="flex flex-wrap items-center gap-5">
        <SourceAvatar src={source.avatarUrl} name={source.name} size={88} />
        <div className="min-w-0 flex-1">
          <PageTitle className="break-words">{source.name}</PageTitle>
          <Body muted as="div" className="mt-[6px]">
            {sourceMeta(source)} · {checkedAgo(source.lastCheckedAt, now)}
          </Body>
          <RuleChips chips={describeSource(source)} size="page" className="mt-[10px]" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outlined" onClick={() => setEditing(true)}>
            Edit rules
          </Button>
          <BellToggle
            form="pill"
            subscribed={source.subscribed}
            onToggle={(subscribed) => setSubscribed.mutate({ id: source.id, subscribed })}
          />
          <IconButton label="Remove from library" onClick={() => setRemoving(true)}>
            <UnlinkIcon />
          </IconButton>
        </div>
      </header>
      {setSubscribed.isError && <StatusLine>{SUBSCRIBE_FAILED}</StatusLine>}
      {editing && <EditRulesModal source={source} onClose={() => setEditing(false)} />}
      {removing && <RemoveSourceModal source={source} onClose={() => setRemoving(false)} />}
    </>
  );
}

/**
 * Confirms "Remove from library" (`DELETE /api/sources/:id`), added so test
 * adds can be undone. Only the source goes; downloaded files stay on disk.
 */
function RemoveSourceModal({ source, onClose }: { source: Source; onClose: () => void }) {
  const navigate = useNavigate();
  const remove = useDeleteSource();

  function confirm() {
    remove.mutate(source.id, {
      onSuccess: () => {
        onClose();
        void navigate({ ...backToChannels, replace: true });
      },
    });
  }

  return (
    <Modal open onClose={onClose} title={`Remove ${source.name}?`} width="min(460px, 100%)">
      <Body>MyTube stops checking it and forgets its rules. Files stay on disk.</Body>
      <div className="grid gap-2">
        <StatusLine>
          {remove.isError ? apiErrorMessage(remove.error, 'Could not remove it.') : undefined}
        </StatusLine>
        <ModalActions>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" disabled={remove.isPending} onClick={confirm}>
            {remove.isPending ? 'Removing…' : 'Remove from library'}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}
