import type { ReactNode } from 'react';
import { previewKey, useAddModal, useJobLogViewer, usePreview } from '../../ui-state';
import { LogViewerModal } from '../activity/LogViewerModal';
import { PreviewModal } from '../library/PreviewModal';
import { AddSourceModal } from '../sources/AddSourceModal';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

/**
 * The app layout. Wide (760px and up): 232px sticky sidebar + fluid main.
 * Narrow: sticky top bar inside main, fixed bottom tab bar.
 *
 * Main owns the outer padding (32px 40px 64px wide, 0 16px 96px narrow) and
 * the vertical rhythm between page sections (28px wide, 20px narrow): pages
 * render their sections as direct children and set no outer padding.
 */
export function AppShell({
  activityCount,
  sidebarFooter,
  children,
}: {
  /** Active downloads; the Activity badge shows when above 0. */
  activityCount: number;
  /** Sidebar footer slot, normally a `SidebarFooter` with the yt-dlp status. */
  sidebarFooter?: ReactNode;
  children: ReactNode;
}) {
  const { open: addOpen, openAdd, closeAdd } = useAddModal();
  const { target: preview, closePreview } = usePreview();
  const { jobId: logJobId, closeJobLog } = useJobLogViewer();
  return (
    <div className="min-h-screen bg-bg text-ink wide:flex">
      <Sidebar activityCount={activityCount} onAdd={openAdd} footer={sidebarFooter} />
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pb-24 wide:gap-7 wide:px-10 wide:pt-8 wide:pb-16">
        <TopBar onAdd={openAdd} />
        {children}
      </main>
      <TabBar activityCount={activityCount} />
      {/* Mounted only while open, so every opening starts empty. */}
      {addOpen && <AddSourceModal onClose={closeAdd} />}
      {/* Keyed by what it shows, so each opening starts at the poster. */}
      {preview !== null && (
        <PreviewModal key={previewKey(preview)} target={preview} onClose={closePreview} />
      )}
      {/* Keyed by the job, so each opening starts with its own toolbar state. */}
      {logJobId !== null && (
        <LogViewerModal key={logJobId} jobId={logJobId} onClose={closeJobLog} />
      )}
    </div>
  );
}
