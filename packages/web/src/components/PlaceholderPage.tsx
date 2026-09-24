import type { ReactNode } from 'react';
import { PageHeader } from './ui/PageHeader';

// Throwaway page body for routes whose screens are not built yet. Replace each use
// with the real screen and delete this file with the last one. The app shell's <main>
// owns the outer padding and section rhythm, so this renders its sections as a fragment.

export function PlaceholderPage({
  title,
  sub,
  actions,
  children,
}: {
  title: string;
  sub: string;
  /** Header right side, for example a `TabPillLinks` track. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} sub={sub} actions={actions} />
      {children}
    </>
  );
}
