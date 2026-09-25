import type { ReactNode } from 'react';
import { Body } from './typography';

export interface EmptyStateProps {
  /** One or two plain sentences: `Nothing downloaded yet.`, `No tracks match.` */
  children: ReactNode;
  /** A button under the text. Only Home has one (Add to library). */
  action?: ReactNode;
}

/**
 * What a screen shows when it has nothing to list. The handoff leaves empty states undesigned
 * and asks for plain muted Archivo 14 text; announced politely, like the other status lines.
 */
export function EmptyState({ children, action }: EmptyStateProps) {
  return (
    <div role="status" className="grid justify-items-start gap-3">
      <Body muted>{children}</Body>
      {action}
    </div>
  );
}
