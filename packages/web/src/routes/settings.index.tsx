import { createFileRoute, redirect } from '@tanstack/react-router';
import { DEFAULT_SETTINGS_TAB } from '../navigation';

export const Route = createFileRoute('/settings/')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/$tab', params: { tab: DEFAULT_SETTINGS_TAB }, replace: true });
  },
});
