import type { VideoListItem } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { videoCardText } from './VideoCard';

const now = Date.parse('2026-09-25T12:00:00Z');

const video = (
  fields: Partial<VideoListItem> = {},
  channel: Partial<VideoListItem['channel']> = {},
) =>
  ({
    id: 7,
    title: 'Why dishwashers ignore you',
    thumbnailUrl: '/api/artwork/video/7',
    durationSeconds: 1864,
    publishedAt: '2026-09-11T10:00:00Z',
    downloadedAt: '2026-09-12T10:00:00Z',
    channel: {
      id: 2,
      name: 'Technology Connections',
      avatarUrl: '/api/artwork/channel/2',
      sourceId: 3,
      ...channel,
    },
    ...fields,
  }) as VideoListItem;

describe('videoCardText', () => {
  it('shows the avatar and `channel · when` with a link to the channel page on the Videos tab', () => {
    expect(videoCardText(video(), true, now)).toEqual({
      title: 'Why dishwashers ignore you',
      thumbnailUrl: '/api/artwork/video/7',
      duration: '31:04',
      when: '2 weeks ago',
      avatarUrl: '/api/artwork/channel/2',
      channel: 'Technology Connections',
      channelHref: '/video/channel/3',
    });
  });

  it('leaves out the avatar and the channel on the channel page', () => {
    const text = videoCardText(video(), false, now);
    expect(text.avatarUrl).toBeUndefined();
    expect(text.channel).toBeUndefined();
    expect(text.channelHref).toBeUndefined();
    expect(text.when).toBe('2 weeks ago');
  });

  it('keeps a channel that is not a source as plain text, and a missing avatar as a blank circle', () => {
    const text = videoCardText(video({}, { sourceId: null, avatarUrl: null }), true, now);
    expect(text.channel).toBe('Technology Connections');
    expect(text.channelHref).toBeUndefined();
    expect(text.avatarUrl).toBeNull();
  });

  it('has no badge or date when they are unknown', () => {
    const text = videoCardText(video({ durationSeconds: null, publishedAt: null }), true, now);
    expect(text.duration).toBeUndefined();
    expect(text.when).toBeUndefined();
  });
});
