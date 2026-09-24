import type { ReactNode } from 'react';

// Throwaway page body for routes whose screens are not built yet. Replace each use
// with the real screen (PageHeader, TabPills, ...) and delete this file with the last one.

export function PlaceholderPage({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex flex-col gap-4 p-8">
      <h1 className="text-h1">{title}</h1>
      <p className="text-body text-muted">{sub}</p>
      {children}
    </main>
  );
}

/** Plain links between the tabs of a section, until the tab pill track exists. */
export function PlaceholderTabs({ children }: { children: ReactNode }) {
  return <nav className="flex gap-4 text-body text-muted">{children}</nav>;
}

/** Props for a placeholder tab link: the active tab reads in ink. */
export const placeholderTabProps = { activeProps: { className: 'text-ink' } } as const;
