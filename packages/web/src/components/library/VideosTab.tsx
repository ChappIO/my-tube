import { VideoGrid } from './VideoGrid';

/** Video → Videos: every video on disk, newest published first; a card plays its channel. */
export function VideosTab() {
  return <VideoGrid showChannel />;
}
