import { createFileRoute, redirect } from '@tanstack/react-router';
import { DEFAULT_MUSIC_TAB } from '../navigation';

export const Route = createFileRoute('/music/')({
  beforeLoad: () => {
    throw redirect({ to: '/music/$tab', params: { tab: DEFAULT_MUSIC_TAB }, replace: true });
  },
});
