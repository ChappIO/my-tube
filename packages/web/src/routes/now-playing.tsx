import { createFileRoute } from '@tanstack/react-router';
import { NowPlayingPage } from '../components/player/NowPlayingPage';

// Now Playing: the player expanded in place of the main column. Back returns to the previous route.
export const Route = createFileRoute('/now-playing')({ component: NowPlayingPage });
