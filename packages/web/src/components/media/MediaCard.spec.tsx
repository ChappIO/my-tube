import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MediaCard, channelLinkClick } from './MediaCard';

/** The markup's text without tags. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const card = (props: Partial<Parameters<typeof MediaCard>[0]> = {}) =>
  renderToStaticMarkup(
    <MediaCard
      title="Hand-cut dovetails"
      art={<div data-art />}
      duration="31:04"
      avatar={<div data-avatar-art />}
      channel="Woodworking essentials"
      channelHref="/video/channel/3"
      onOpenChannel={() => {}}
      when="2 weeks ago"
      onOpen={() => {}}
      {...props}
    />,
  );

const click = (fields: Partial<Parameters<typeof channelLinkClick>[0]> = {}) => ({
  stopPropagation: vi.fn<() => void>(),
  preventDefault: vi.fn<() => void>(),
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...fields,
});

describe('MediaCard', () => {
  it('renders the title, the duration and `channel · when` with the channel as a link', () => {
    const html = card();
    expect(text(html)).toBe('31:04 Hand-cut dovetails Woodworking essentials · 2 weeks ago');
    expect(html).toContain('aria-label="Hand-cut dovetails"');
    expect(html).toMatch(/<a href="\/video\/channel\/3"[^>]*>Woodworking essentials<\/a>/);
    expect(html).toContain('aspect-video');
    expect(html).toContain('grid-cols-[36px_1fr]');
    expect(html).toContain('data-avatar');
  });

  it('keeps the channel link outside the overlay button, so its clicks never open the card', () => {
    const html = card();
    // The overlay is an empty button; the link comes after it, not inside it.
    expect(html).toMatch(/<button[^>]*data-overlay[^>]*><\/button>/);
    expect(html.indexOf('<a ')).toBeGreaterThan(html.indexOf('</button>'));
  });

  it('drops the avatar column and the channel on the channel page', () => {
    const html = card({ avatar: undefined, channel: undefined, channelHref: undefined });
    expect(html).not.toContain('data-avatar');
    expect(html).not.toContain('grid-cols-[36px_1fr]');
    expect(html).not.toContain('<a ');
    expect(text(html)).toBe('31:04 Hand-cut dovetails 2 weeks ago');
  });

  it('shows a channel that is not a source as plain text', () => {
    const html = card({ channelHref: undefined, onOpenChannel: undefined });
    expect(html).not.toContain('<a ');
    expect(text(html)).toContain('Woodworking essentials · 2 weeks ago');
  });

  it('has no overlay button without onOpen', () => {
    expect(card({ onOpen: undefined })).not.toContain('<button');
  });
});

describe('channelLinkClick', () => {
  it('stops propagation and navigates in the app on a plain click', () => {
    const event = click();
    const onOpenChannel = vi.fn<() => void>();
    channelLinkClick(event, onOpenChannel);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onOpenChannel).toHaveBeenCalledOnce();
  });

  it('leaves modified clicks to the browser (new tab), still without reaching the card', () => {
    for (const modified of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { button: 1 },
    ]) {
      const event = click(modified);
      const onOpenChannel = vi.fn<() => void>();
      channelLinkClick(event, onOpenChannel);
      expect(event.stopPropagation).toHaveBeenCalledOnce();
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(onOpenChannel).not.toHaveBeenCalled();
    }
  });
});
