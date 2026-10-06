import { describe, expect, it } from 'vitest';

import { cookiesMayHelp, ytdlpFailure } from './ytdlp-error.js';

describe('ytdlpFailure', () => {
  it('types the failures the runner handles', () => {
    expect(ytdlpFailure('[youtube] abc: Requested format is not available')).toBe(
      'format_unavailable',
    );
    expect(ytdlpFailure("[youtube] abc: Sign in to confirm you're not a bot")).toBe('bot_check');
    expect(
      ytdlpFailure('[youtube] abc: Join this channel to get access to members-only content'),
    ).toBe('sign_in');
    expect(ytdlpFailure('Unable to download webpage: HTTP Error 503')).toBeNull();
    expect(ytdlpFailure(null)).toBeNull();
  });

  it('lets a signed-in Premium session try a Music Premium-only track once', () => {
    const failure = ytdlpFailure(
      '[youtube] hwXJDhKaV6M: This video is only available to Music Premium members',
    );
    expect(failure).toBe('sign_in');
    expect(cookiesMayHelp(failure)).toBe(true);
  });
});
