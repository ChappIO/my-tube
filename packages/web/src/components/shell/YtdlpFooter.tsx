import { useYtdlpStatus, ytdlpSummary } from '../../api/ytdlp';
import { SidebarFooter } from './Sidebar';

/** The sidebar footer fed by `GET /api/ytdlp/status`: `yt-dlp 2026.09.22` / `up to date · auto-update on`. */
export function YtdlpFooter() {
  const { data, isError } = useYtdlpStatus();
  if (!data) {
    return <SidebarFooter version="—" status={isError ? 'status unavailable' : 'loading…'} />;
  }
  return <SidebarFooter version={data.installedVersion ?? '—'} status={ytdlpSummary(data)} />;
}
