import { createFileRoute, redirect } from '@tanstack/react-router';
import { DEFAULT_VIDEO_TAB } from '../navigation';

export const Route = createFileRoute('/video/')({
  beforeLoad: () => {
    throw redirect({ to: '/video/$tab', params: { tab: DEFAULT_VIDEO_TAB }, replace: true });
  },
});
