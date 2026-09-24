import { Outlet, createRootRoute, useLocation } from '@tanstack/react-router';
import { useActivitySummary } from '../api/activity';
import { useThemeFromSettings } from '../api/settings';
import { AppShell } from '../components/shell/AppShell';
import { YtdlpFooter } from '../components/shell/YtdlpFooter';

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });
  // The stored theme (settings table) wins over the localStorage pre-paint copy.
  useThemeFromSettings();
  const summary = useActivitySummary();
  // /dev/* reference pages are standalone: they render their own <main> and padding.
  if (pathname === '/dev' || pathname.startsWith('/dev/')) return <Outlet />;
  return (
    <AppShell activityCount={summary.data?.activeDownloads ?? 0} sidebarFooter={<YtdlpFooter />}>
      <Outlet />
    </AppShell>
  );
}
