import { type Source, describeSource } from '@mytube/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useSetSubscribed, useSources } from '../../api/sources';
import { checkedAgo } from '../../format';
import { useNow } from '../../use-now';
import { BellToggle } from '../media';
import { Button } from '../ui/Button';
import { cx, focusRing } from '../ui/cx';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, fromQuery, loadFailed } from '../ui/ErrorState';
import { Meta } from '../ui/typography';
import { EditRulesModal } from './EditRulesModal';
import { RuleChips, SourceAvatar, StatusLine } from './SourceBits';
import { sourceMeta } from './source-text';

/** Shown when a bell toggle fails and the optimistic change is rolled back. */
export const SUBSCRIBE_FAILED = 'Could not change the subscription. The previous state is back.';

/**
 * Video → Channels (handoff Screen 3): every source in the Video library, channels and
 * playlists, newest first, as rows with rule chips, the last check, the bell and Edit.
 */
export function ChannelsTab() {
  const sources = useSources('video');
  const setSubscribed = useSetSubscribed();
  const [editingId, setEditingId] = useState<number>();
  const now = useNow();

  if (sources.data === undefined) {
    if (loadFailed(sources)) return <ErrorState what="the channels" {...fromQuery(sources)} />;
    return <StatusLine>Loading channels.</StatusLine>;
  }
  if (sources.data.length === 0) {
    return <EmptyState>No channels yet. Add one with + Add to library.</EmptyState>;
  }

  const editing = sources.data.find((source) => source.id === editingId);
  return (
    <>
      {setSubscribed.isError && <StatusLine>{SUBSCRIBE_FAILED}</StatusLine>}
      <ul className="grid gap-3">
        {sources.data.map((source) => (
          <ChannelRow
            key={source.id}
            source={source}
            checked={checkedAgo(source.lastCheckedAt, now)}
            onSubscribe={(subscribed) => setSubscribed.mutate({ id: source.id, subscribed })}
            onEdit={() => setEditingId(source.id)}
          />
        ))}
      </ul>
      {editing && <EditRulesModal source={editing} onClose={() => setEditingId(undefined)} />}
    </>
  );
}

interface ChannelRowProps {
  source: Source;
  /** `checked 12 min ago`. */
  checked: string;
  onSubscribe: (subscribed: boolean) => void;
  onEdit: () => void;
}

/**
 * One Channels row: grid `56px 1fr auto`, gap 16, padding 14px 16px, `line` border, radius
 * 12. Below 760px the grid is `56px 1fr`, the actions wrap to a full-width row and the last
 * check is hidden.
 */
function ChannelRow({ source, checked, onSubscribe, onEdit }: ChannelRowProps) {
  return (
    <li className="grid grid-cols-[56px_1fr] items-center gap-x-4 gap-y-3 rounded-tile border border-line px-4 py-[14px] wide:grid-cols-[56px_1fr_auto]">
      <SourceAvatar src={source.avatarUrl} name={source.name} size={56} />
      <div className="min-w-0">
        <Link
          to="/video/channel/$id"
          params={{ id: String(source.id) }}
          className={cx('text-row-title break-words hover:text-red', focusRing)}
        >
          {source.name}
        </Link>
        <div className="mt-[3px] font-sans text-[13px] text-muted">{sourceMeta(source)}</div>
        <RuleChips chips={describeSource(source)} className="mt-2" />
      </div>
      <div className="col-span-full flex items-center justify-end gap-2 wide:col-span-1">
        <Meta className="hidden whitespace-nowrap wide:block">{checked}</Meta>
        <BellToggle
          subscribed={source.subscribed}
          onToggle={onSubscribe}
          label={`Subscribe to ${source.name}`}
        />
        <Button variant="outlined" aria-label={`Edit rules for ${source.name}`} onClick={onEdit}>
          Edit
        </Button>
      </div>
    </li>
  );
}
