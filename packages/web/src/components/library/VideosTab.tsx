import { VideoGrid } from './VideoGrid';

/** Video → Videos (handoff Screen 3): every video on disk, newest published first. */
export function VideosTab() {
  return <VideoGrid meta="channel-when" />;
}
