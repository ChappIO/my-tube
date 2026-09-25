import type { SubtitleTrack } from '@mytube/shared';
import {
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  SUBTITLE_SIZES,
  type SubtitleSize,
  cycleSpeed,
  setSubBg,
  setSubSize,
  speedLabel,
  toggleTheater,
} from '../../video-prefs';
import { TabPills } from '../ui/TabPills';
import { Toggle } from '../ui/Toggle';
import { cx, focusRingVisible, focusRingVisibleInset, minHit } from '../ui/cx';

/** The strip's popovers; only one is open at a time. */
export type StripPopover = 'captions' | 'style' | null;

/** A popover button's click: opens it (closing the other) or closes it when it is open. */
export function togglePopover(
  open: StripPopover,
  which: Exclude<StripPopover, null>,
): StripPopover {
  return open === which ? null : which;
}

/** What the CC button reads: the active track's language, or Off. */
export function captionsLabel(tracks: readonly SubtitleTrack[], active: number): string {
  return tracks[active]?.label ?? 'Off';
}

export interface ControlStripProps {
  tracks: readonly SubtitleTrack[];
  /** The index of the track on screen, -1 for Off. */
  active: number;
  onPick: (index: number) => void;
  subSize: SubtitleSize;
  subBg: boolean;
  speed: number;
  theater: boolean;
  onPopOut: () => void;
}

/**
 * Now Playing's control strip under the video (frontend skill "Player", "Video"): outlined pills
 * that wrap. Left: captions (CC), subtitle style and speed; right: Pop out and Theater / Fit
 * (wide screens only). The captions menu and the style popover are exclusive and close with a
 * click outside, Escape, or when Now Playing goes (their state lives here).
 */
export function ControlStrip({
  tracks,
  active,
  onPick,
  subSize,
  subBg,
  speed,
  theater,
  onPopOut,
}: ControlStripProps) {
  const [open, setOpen] = useState<StripPopover>(null);
  const close = () => setOpen(null);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <CaptionsMenu
          tracks={tracks}
          active={active}
          open={open === 'captions'}
          onToggle={() => setOpen((current) => togglePopover(current, 'captions'))}
          onClose={close}
          onPick={(index) => {
            onPick(index);
            close();
          }}
        />
        <SubtitleStylePopover
          size={subSize}
          background={subBg}
          open={open === 'style'}
          onToggle={() => setOpen((current) => togglePopover(current, 'style'))}
          onClose={close}
        />
        <SpeedButton speed={speed} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ControlPill onClick={onPopOut} title="Keep playing in the floating card">
          Pop out
        </ControlPill>
        <ControlPill onClick={toggleTheater} wideOnly>
          {theater ? 'Fit' : 'Theater'}
        </ControlPill>
      </div>
    </div>
  );
}

interface ControlPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Filled `ink` with `bg` text (captions on). */
  active?: boolean;
  /** Space Mono (Speed). */
  mono?: boolean;
  /** Hidden below 760px (Theater / Fit). */
  wideOnly?: boolean;
}

/** An outlined control pill: Archivo 600 13, 8px 14px, `line` border, hover `surface`. */
export function ControlPill({
  active = false,
  mono = false,
  wideOnly = false,
  className,
  ...props
}: ControlPillProps) {
  return (
    <button
      type="button"
      className={cx(
        wideOnly ? 'hidden wide:inline-flex' : 'inline-flex',
        'shrink-0 cursor-pointer items-center justify-center gap-2 rounded-pill border px-[14px] py-2 text-[13px] font-semibold whitespace-nowrap',
        mono ? 'font-mono' : 'font-sans',
        active ? 'border-ink bg-ink text-bg' : 'border-line text-ink hover:bg-surface',
        minHit,
        focusRingVisible,
        className,
      )}
      {...props}
    />
  );
}

/**
 * A popover under its button: `bg`, `line` border, radius 12, the popover shadow. Closes on a
 * pointer down outside `anchor` and on Escape (which then does not also leave Now Playing).
 */
function PopoverAnchor({
  open,
  onClose,
  button,
  children,
}: {
  open: boolean;
  onClose: () => void;
  button: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) {
        onCloseRef.current();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };
  return (
    <div ref={ref} className="relative" onKeyDown={onKeyDown}>
      {button}
      {open && children}
    </div>
  );
}

const popoverBox =
  'absolute top-[calc(100%+8px)] left-0 z-[5] rounded-[12px] border border-line bg-bg text-ink shadow-popover';

/** The `CC` badge: Space Mono 700 10 in a 1.5px border, radius 3. */
function CcBadge() {
  return (
    <span
      aria-hidden="true"
      className="rounded-[3px] border-[1.5px] border-current px-[3px] font-mono text-[10px] leading-[13px] font-bold"
    >
      CC
    </span>
  );
}

/**
 * The captions button and its menu: Off and one item per track (the language, with `embedded` or
 * `sidecar` as a hint), the chosen one in red. Filled `ink` while captions are on.
 */
export function CaptionsMenu({
  tracks,
  active,
  open,
  onToggle,
  onClose,
  onPick,
}: {
  tracks: readonly SubtitleTrack[];
  active: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (index: number) => void;
}) {
  const menuId = useId();
  const on = active >= 0 && active < tracks.length;
  return (
    <PopoverAnchor
      open={open}
      onClose={onClose}
      button={
        <ControlPill
          active={on}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`Captions: ${captionsLabel(tracks, active)}`}
          onClick={onToggle}
        >
          <CcBadge />
          {captionsLabel(tracks, active)}
        </ControlPill>
      }
    >
      <div
        id={menuId}
        role="menu"
        aria-label="Captions"
        className={cx(popoverBox, 'min-w-[190px] p-[6px]')}
      >
        <MenuItem selected={!on} onSelect={() => onPick(-1)}>
          Off
        </MenuItem>
        {tracks.map((track, index) => (
          <MenuItem
            // The same language can come twice (a sidecar and an embedded track).
            key={track.url}
            selected={index === active}
            hint={track.kind}
            onSelect={() => onPick(index)}
          >
            {track.label}
          </MenuItem>
        ))}
        {tracks.length === 0 && (
          <p className="px-3 py-[9px] font-sans text-[13px] text-muted">
            No subtitles in this video.
          </p>
        )}
      </div>
    </PopoverAnchor>
  );
}

function MenuItem({
  selected,
  hint,
  onSelect,
  children,
}: {
  selected: boolean;
  hint?: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        'flex w-full cursor-pointer items-center justify-between gap-3 rounded-[8px] px-3 py-[9px] text-left font-sans text-[13px] font-medium hover:bg-surface',
        selected ? 'text-red' : 'text-ink',
        focusRingVisibleInset,
      )}
    >
      <span>{children}</span>
      {hint && <span className="font-mono text-[11px] font-normal text-muted">{hint}</span>}
    </button>
  );
}

const SIZE_ITEMS = SUBTITLE_SIZES.map((size) => ({ id: size, label: size }));

/** Subtitle style: the Size S/M/L pill track and the Background toggle, in a popover. */
export function SubtitleStylePopover({
  size,
  background,
  open,
  onToggle,
  onClose,
}: {
  size: SubtitleSize;
  background: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const panelId = useId();
  return (
    <PopoverAnchor
      open={open}
      onClose={onClose}
      button={
        <ControlPill
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={onToggle}
        >
          Subtitle style
        </ControlPill>
      }
    >
      <div
        id={panelId}
        role="dialog"
        aria-label="Subtitle style"
        className={cx(popoverBox, 'grid min-w-[240px] gap-[14px] p-[14px]')}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-[13px] font-semibold">Size</span>
          <TabPills
            label="Subtitle size"
            size="sm"
            items={SIZE_ITEMS}
            value={size}
            onChange={setSubSize}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="font-sans text-[13px] font-semibold">Background</span>
          <Toggle size="sm" label="Subtitle background" checked={background} onChange={setSubBg} />
        </div>
      </div>
    </PopoverAnchor>
  );
}

/** Speed in Space Mono: one click is one step of 1× → 1.25× → 1.5× → 2× → 0.75× → 1×. */
export function SpeedButton({ speed }: { speed: number }) {
  return (
    <ControlPill mono onClick={cycleSpeed} aria-label={`Speed ${speedLabel(speed)}`} title="Speed">
      {speedLabel(speed)}
    </ControlPill>
  );
}
