export interface DurationBadgeProps {
  /** Formatted length, for example `48:12`. */
  duration: string;
  /** Layout placement only. */
  className?: string;
}

/**
 * Video length on the art: bottom-right, 8px in, Space Mono 700 10px, `ink` fill with `bg`
 * text, 2px 6px padding, radius 4. The parent must be positioned (Artwork and MediaTile are).
 */
export function DurationBadge({ duration, className = '' }: DurationBadgeProps) {
  return (
    <span
      className={`absolute right-2 bottom-2 z-[1] rounded-badge bg-ink px-1.5 py-0.5 text-duration text-bg ${className}`}
    >
      {duration}
    </span>
  );
}
