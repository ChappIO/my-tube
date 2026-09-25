/*
 * Where the one `<video>` element is shown (frontend skill "Player", "Video surfaces"). The
 * element is created once by `VideoEngine` and never re-created: surfaces (the floating card's
 * art block, Now Playing's player frame) register an empty host element, and the element is
 * moved into the most important host there is, or into the engine's hidden park when none is
 * mounted. Moving a media element with `appendChild` inside one task does not pause or reload
 * it, so switching surfaces never restarts playback.
 */

/** A surface that can show the video. Now Playing's frame wins over the card. */
export type VideoSurfaceKind = 'card' | 'frame';

export const SURFACE_PRIORITY: Readonly<Record<VideoSurfaceKind, number>> = {
  card: 1,
  frame: 2,
};

/** What placing needs of the media element. */
export interface PlaceableMedia {
  readonly parentNode: unknown;
}

/** What placing needs of a host (an element; a plain object in tests). */
export interface VideoHost {
  appendChild(node: PlaceableMedia): unknown;
}

interface Registration {
  host: VideoHost;
  kind: VideoSurfaceKind;
}

/** The host the video belongs in: the highest priority, the latest registered among equals. */
export function pickHost(registrations: readonly Registration[]): VideoHost | null {
  let best: Registration | null = null;
  for (const registration of registrations) {
    if (!best || SURFACE_PRIORITY[registration.kind] >= SURFACE_PRIORITY[best.kind]) {
      best = registration;
    }
  }
  return best?.host ?? null;
}

/** Moves the element into `host` unless it is already there. The element keeps playing. */
export function placeVideo(media: PlaceableMedia, host: VideoHost): void {
  if (media.parentNode !== host) host.appendChild(media);
}

let registrations: Registration[] = [];
let media: PlaceableMedia | null = null;
let park: VideoHost | null = null;

function place(): void {
  if (!media) return;
  const host = pickHost(registrations) ?? park;
  if (host) placeVideo(media, host);
}

/** The engine hands over its element and the hidden park it falls back to (null on unmount). */
export function setVideoMedia(element: PlaceableMedia | null, fallback: VideoHost | null): void {
  media = element;
  park = fallback;
  place();
}

/**
 * A surface mounts: the video moves in when it is the most important one. Returns the cleanup,
 * which moves the video on to the next surface or the park.
 */
export function registerVideoHost(host: VideoHost, kind: VideoSurfaceKind): () => void {
  const registration = { host, kind };
  registrations = [...registrations, registration];
  place();
  return () => {
    registrations = registrations.filter((entry) => entry !== registration);
    place();
  };
}
