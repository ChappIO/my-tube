import { VideoGrid } from './VideoGrid';

/** Video → Videos: every video on disk, newest published first. */
export function VideosTab() {
  return <VideoGrid showChannel />;
}
