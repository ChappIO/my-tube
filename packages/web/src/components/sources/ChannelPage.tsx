import { type Source, describeRules } from '@mytube/shared';
import { linkOptions, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, apiErrorMessage } from '../../api/client';
import { useDeleteSource, useSetSubscribed, useSource } from '../../api/sources';
import { checkedAgo } from '../../format';
import { useNow } from '../../use-now';
import { UnlinkIcon } from '../icons';
import { BellToggle } from '../media';
import { BackLink } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Modal, ModalActions } from '../ui/Modal';
import { Body, PageTitle } from '../ui/typography';
import { SUBSCRIBE_FAILED } from './ChannelsTab';
import { EditRulesModal } from './EditRulesModal';
import { RuleChips, SourceAvatar, StatusLine } from './SourceBits';
import { sourceMeta } from './source-text';

const backToChannels = linkOptions({ to: '/video/$tab', params: { tab: 'channels' } });

/**
 * The channel page (handoff Screen 3): back link, header with avatar, name, meta and rule
 * chips, Edit rules and the bell pill. `id` is the route param, a source id. The videos grid
 * arrives in Stage 5; until then the body is the plain empty state.
 */
export function ChannelPage({ id }: { id: string }) {
  const sourceId = /^\d+$/.test(id) ? Number(id) : 0;
  const source = useSource(sourceId);

  let body;
  if (sourceId === 0 || (source.error instanceof ApiError && source.error.status === 404)) {
    body = <StatusLine>This channel is not in your library.</StatusLine>;
  } else if (source.isPending) {
    body = <StatusLine>Loading channel.</StatusLine>;
  } else if (source.isError) {
    body = <StatusLine>Could not load this channel.</StatusLine>;
  } else {
    body = (
      <>
        <ChannelHeader source={source.data} />
        <Body muted>Nothing downloaded yet.</Body>
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
          <RuleChips chips={describeRules(source.rules)} size="page" className="mt-[10px]" />
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
 * Confirms "Remove from library" (`DELETE /api/sources/:id`). Not in the handoff: added so test
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
