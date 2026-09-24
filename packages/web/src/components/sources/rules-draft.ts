import {
  DEFAULT_VIDEO_RULES,
  type Library,
  type MusicSourceRules,
  Rules,
  type SourceKind,
  TITLE_FILTER_MAX,
  type VideoSettings,
  defaultRules,
} from '@mytube/shared';

/*
 * The rule rows' editing state. The Add and Edit rules modals edit a draft rather than `Rules`
 * directly, because a checked row with an inline field ("Only titles matching", "Everything
 * published after") can hold text that is not a valid rule yet, and an unchecked "Keep only
 * the last N days" still remembers its N.
 */

export interface VideoRulesDraft {
  library: 'video';
  skipShorts: boolean;
  /** "Keep only the last N days" checked; unchecked keeps files forever (`keepDays: null`). */
  keep: boolean;
  keepDays: number;
  /** "Only titles matching" checked, and its text. */
  titleOn: boolean;
  title: string;
  /** "Everything published after" checked, and its `YYYY-MM-DD` date. */
  afterOn: boolean;
  after: string;
  /** Playlists only: number files in playlist order. */
  syncOrder: boolean;
}

export type RulesDraft = VideoRulesDraft | MusicSourceRules;

/** The day count a video source starts with when there is no other: the handoff's 90. */
export const FALLBACK_KEEP_DAYS = DEFAULT_VIDEO_RULES.keepDays ?? 90;

/** The editable form of a source's rules. `fallbackKeepDays` fills N when keep is off. */
export function draftFromRules(rules: Rules, fallbackKeepDays = FALLBACK_KEEP_DAYS): RulesDraft {
  if (rules.library === 'music') return { ...rules };
  return {
    library: 'video',
    skipShorts: rules.skipShorts,
    keep: rules.keepDays !== null,
    keepDays: rules.keepDays ?? fallbackKeepDays,
    titleOn: rules.titleFilter !== null,
    title: rules.titleFilter ?? '',
    afterOn: rules.publishedAfter !== null,
    after: rules.publishedAfter ?? '',
    syncOrder: rules.syncOrder,
  };
}

/**
 * The draft a new source starts with: the library defaults, and for video the Settings → Video
 * defaults for new channels (`keepDays`, `skipShorts`) when settings are loaded. Mirrors what
 * the API applies on create.
 */
export function newRulesDraft(
  library: Library,
  video?: Pick<VideoSettings, 'keepDays' | 'skipShorts'>,
): RulesDraft {
  const rules = defaultRules(library);
  if (rules.library === 'video' && video) {
    return draftFromRules(
      { ...rules, keepDays: video.keepDays, skipShorts: video.skipShorts },
      video.keepDays ?? FALLBACK_KEEP_DAYS,
    );
  }
  return draftFromRules(rules);
}

export type DraftResult = { ok: true; rules: Rules } | { ok: false; error: string };

/**
 * The rules a draft stands for, or the reason it cannot be saved yet (a checked row with an
 * empty or invalid field). `kind` drops `syncOrder` for anything but a playlist.
 */
export function rulesFromDraft(draft: RulesDraft, kind: SourceKind): DraftResult {
  if (draft.library === 'music') return { ok: true, rules: { ...draft } };
  const title = draft.title.trim();
  if (draft.titleOn && !title) {
    return { ok: false, error: 'Enter the text titles must contain, or untick the rule.' };
  }
  if (draft.titleOn && title.length > TITLE_FILTER_MAX) {
    return { ok: false, error: `Title text can be at most ${TITLE_FILTER_MAX} characters.` };
  }
  if (draft.afterOn && !/^\d{4}-\d{2}-\d{2}$/.test(draft.after)) {
    return { ok: false, error: 'Pick the date to download from, or untick the rule.' };
  }
  const parsed = Rules.safeParse({
    library: 'video',
    skipShorts: draft.skipShorts,
    keepDays: draft.keep ? draft.keepDays : null,
    titleFilter: draft.titleOn ? title : null,
    publishedAfter: draft.afterOn ? draft.after : null,
    syncOrder: kind === 'playlist' && draft.syncOrder,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'These rules are not valid.' };
  }
  return { ok: true, rules: parsed.data };
}
