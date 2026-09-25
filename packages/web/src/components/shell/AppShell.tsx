import type { ReactNode } from 'react';
import { usePlayerActive } from '../../player-state';
import { previewKey, useAddModal, useJobLogViewer, usePreview } from '../../ui-state';
import { LogViewerModal } from '../activity/LogViewerModal';
import { PreviewModal } from '../library/PreviewModal';
import { PlayerLayer } from '../player/PlayerLayer';
import { AddSourceModal } from '../sources/AddSourceModal';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';
import { cx } from '../ui/cx';

/**
 * The app layout. Wide (760px and up): 232px sticky sidebar + fluid main.
 * Narrow: sticky top bar inside main, fixed bottom tab bar.
 *
 * Main owns the outer padding (32px 40px 64px wide, 0 16px 96px narrow) and
 * the vertical rhythm between page sections (28px wide, 20px narrow): pages
 * render their sections as direct children and set no outer padding. While the player bar is up
 * the bottom padding grows by the bar's height plus 40px, so the last row scrolls clear of it.
 *
 * The player (`PlayerLayer`: the audio engine, bar, card, keyboard and Media Session) is mounted
 * here once, so playback survives navigation.
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
  const playing = usePlayerActive();
  return (
    <div className="min-h-screen bg-bg text-ink wide:flex">
      <Sidebar
        activityCount={activityCount}
        onAdd={openAdd}
        footer={sidebarFooter}
        playerBar={playing}
      />
      <main
        className={cx(
          'flex min-w-0 flex-1 flex-col gap-5 px-4 wide:gap-7 wide:px-10 wide:pt-8',
          playing
            ? 'pb-[calc(96px+var(--player-bar-height,52px)+40px)] wide:pb-[calc(64px+var(--player-bar-height,118px)+40px)]'
            : 'pb-24 wide:pb-16',
        )}
      >
        <TopBar onAdd={openAdd} />
        {children}
      </main>
      <TabBar activityCount={activityCount} />
      <PlayerLayer />
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
