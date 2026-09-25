import { DEFAULT_VIDEO_MATCHER } from '@mytube/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MatcherBuilder } from './MatcherBuilder';
import { draftFromMatcher } from './matcher-draft';

describe('MatcherBuilder', () => {
  it('renders the video default with its "Is members-only" condition negated and valueless', () => {
    const html = renderToStaticMarkup(
      <MatcherBuilder
        value={draftFromMatcher(DEFAULT_VIDEO_MATCHER)}
        onChange={() => {}}
        playlist={false}
      />,
    );
    // Three conditions, each with its type select; the last is members-only.
    const selected = [...html.matchAll(/<option value="([a-z_]+)" selected="">/g)].map(
      (match) => match[1],
    );
    expect(selected).toEqual(['is_short', 'older_than_days', 'is_members_only']);
    expect(html).toContain('>Is members-only</option>');
    // Every condition is negated: three pressed NOT toggles (the root group's is not), plus the
    // root's active AND pill.
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    // Only "Older than" has a value box.
    expect(html.match(/aria-label="Days"/g)).toHaveLength(1);
  });
});
