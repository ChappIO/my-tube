import { type Library, type ResolvedSource, guessLibrary, parseYoutubeUrl } from '@mytube/shared';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import { useSettings } from '../../api/settings';
import { conflictSourceId, useCreateSource, useResolveSource } from '../../api/sources';
import { MusicIcon, VideoIcon } from '../icons';
import { Input } from '../ui/Input';
import { Modal, ModalActions } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TabPills } from '../ui/TabPills';
import { Body, FieldLabel, Meta } from '../ui/typography';
import { RuleRows } from './RuleRows';
import { type RulesDraft, newRulesDraft, rulesFromDraft } from './rules-draft';
import { SourceAvatar, StatusLine } from './SourceBits';
import { kindInLibrary, libraryLabel, resolvedMeta } from './source-text';

/** How long typing must pause before a valid link is looked up. */
const RESOLVE_DELAY_MS = 400;

const INVALID_LINK = 'Not a YouTube channel, artist or playlist link.';

const libraryItems = [
  { id: 'video', label: 'Video', icon: VideoIcon },
  { id: 'music', label: 'Music', icon: MusicIcon },
] as const satisfies readonly { id: Library; label: string; icon: unknown }[];

export interface AddSourceModalProps {
  onClose: () => void;
}

/**
 * "Add to library" (handoff Screen 4). Render it only while open (the app shell does), so every
 * opening starts empty.
 *
 * Typing or pasting a link is checked with `parseYoutubeUrl` on every keystroke; a valid one is
 * resolved through the API once typing pauses for 400ms (Enter skips the wait). The source
 * card, the Save to switch and the rule rows appear once it resolves. Subscribe creates the
 * source, closes the modal and opens the library it went to. A source that already exists in
 * the chosen library turns Subscribe into Open.
 */
export function AddSourceModal({ onClose }: AddSourceModalProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const settings = useSettings();
  const resolve = useResolveSource();
  const create = useCreateSource();

  const [text, setText] = useState('');
  // The text as it was when typing last paused; lookups and the invalid message follow it.
  const [settled, setSettled] = useState('');
  // Save to, as picked for one link; another link starts from its own guess again.
  const [choice, setChoice] = useState<{ url: string; library: Library }>();
  const [drafts, setDrafts] = useState<Partial<Record<Library, RulesDraft>>>({});

  // The link box takes focus on open. This runs after Modal's own effect, which focuses the
  // dialog, because parent effects run after their children's.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(text.trim()), RESOLVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const parsed = parseYoutubeUrl(text);
  const target = parseYoutubeUrl(settled)?.url;
  // Both are stable across renders.
  const resolveUrl = resolve.mutate;
  const resetCreate = create.reset;

  // A new link: look it up, and forget the previous link's failed create.
  useEffect(() => {
    if (!target) return;
    resetCreate();
    resolveUrl(target);
  }, [target, resolveUrl, resetCreate]);

  // Only answers for the link that is in the box now count.
  const current = parsed !== null && resolve.variables === parsed.url ? resolve : undefined;
  const resolved: ResolvedSource | undefined = current?.data;
  const chosenLibrary = choice && parsed && choice.url === parsed.url ? choice.library : undefined;
  const library = chosenLibrary ?? resolved?.library ?? (parsed ? guessLibrary(parsed) : 'video');
  const kind = resolved ? kindInLibrary(resolved.kind, library) : 'channel';
  const draft = drafts[library] ?? newRulesDraft(library, settings.data?.video);
  const draftResult = rulesFromDraft(draft, kind);

  // The source this link already is in the chosen library: from the lookup, or from a 409.
  const existingId =
    (resolved?.alreadyAdded?.library === library ? resolved.alreadyAdded.sourceId : undefined) ??
    conflictSourceId(create.error);
  const otherLibrary = resolved?.alreadyAdded && resolved.alreadyAdded.library !== library;

  function chooseLibrary(next: Library) {
    if (parsed) setChoice({ url: parsed.url, library: next });
    create.reset();
  }

  function openExisting(id: number) {
    onClose();
    if (library === 'video') {
      void navigate({ to: '/video/channel/$id', params: { id: String(id) } });
    } else {
      void navigate({ to: '/music/$tab', params: { tab: 'artists' } });
    }
  }

  function subscribe() {
    if (!resolved || !draftResult.ok) return;
    create.mutate(
      { url: resolved.url, library, rules: draftResult.rules },
      {
        onSuccess: (source) => {
          onClose();
          if (source.library === 'video') {
            void navigate({ to: '/video/$tab', params: { tab: 'channels' } });
          } else {
            void navigate({ to: '/music/$tab', params: { tab: 'artists' } });
          }
        },
      },
    );
  }

  let lookup: string | undefined;
  if (text.trim() && !parsed && settled === text.trim()) lookup = INVALID_LINK;
  else if (parsed && !current?.isSuccess && !current?.isError) lookup = 'Looking up…';
  else if (current?.isError)
    lookup = apiErrorMessage(current.error, 'Could not look up this link.');

  let footerNote: string | undefined;
  if (existingId !== undefined) footerNote = `Already in the ${libraryLabel(library)} library.`;
  else if (create.isError) footerNote = apiErrorMessage(create.error, 'Could not add this source.');
  else if (resolved && !draftResult.ok) footerNote = draftResult.error;

  return (
    <Modal open onClose={onClose} title="Add to library">
      <div className="grid gap-2">
        <FieldLabel htmlFor={inputId}>Paste a YouTube link</FieldLabel>
        <Input
          ref={inputRef}
          id={inputId}
          mono
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://www.youtube.com/@channel or /playlist?list=…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setSettled(text.trim());
          }}
        />
        <StatusLine>{lookup}</StatusLine>
      </div>

      {resolved && (
        <>
          <SourceCard resolved={resolved} library={library} />
          <div className="grid gap-2">
            <FieldLabel as="div">Save to</FieldLabel>
            <TabPills
              label="Save to"
              items={libraryItems}
              value={library}
              onChange={chooseLibrary}
              className="w-max"
            />
            {otherLibrary && resolved.alreadyAdded && (
              <Body muted>Also in the {libraryLabel(resolved.alreadyAdded.library)} library.</Body>
            )}
          </div>
          {existingId === undefined && (
            <RuleRows
              draft={draft}
              kind={kind}
              onChange={(next) => setDrafts((all) => ({ ...all, [library]: next }))}
            />
          )}
        </>
      )}

      <div className="grid gap-2">
        <StatusLine>{footerNote}</StatusLine>
        <ModalActions>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          {existingId === undefined ? (
            <Button
              variant="primary"
              size="lg"
              disabled={!resolved || !draftResult.ok || create.isPending}
              onClick={subscribe}
            >
              {create.isPending ? 'Adding…' : 'Subscribe'}
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={() => openExisting(existingId)}>
              Open
            </Button>
          )}
        </ModalActions>
      </div>
    </Modal>
  );
}

/** The detected-source card: 44px avatar, name, and the kind with counts or cadence. */
function SourceCard({ resolved, library }: { resolved: ResolvedSource; library: Library }) {
  return (
    <div className="flex items-center gap-[14px] rounded-tile border border-line p-[14px]">
      <SourceAvatar src={resolved.avatarUrl} name={resolved.name} size={44} />
      <div className="min-w-0">
        <div className="truncate font-sans text-[15px] font-bold">{resolved.name}</div>
        <Meta as="div" className="mt-[2px]">
          {resolvedMeta(resolved, library)}
        </Meta>
        {resolved.resolvedFrom === 'video' && (
          <Meta as="div" size="sm">
            The channel of the pasted video.
          </Meta>
        )}
      </div>
    </div>
  );
}
