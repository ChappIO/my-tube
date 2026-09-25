import { type RefObject, useEffect, useRef } from 'react';
import { FALLBACK_PALETTE, type Palette, createPaletteCache, loadCoverPixels } from './palette';

/** The app's palettes, one per art URL. */
const covers = createPaletteCache(loadCoverPixels);

/**
 * The visualizer colours of the current cover, as a ref the frame loop reads (a new cover does
 * not re-render anything). Re-extracted when `artUrl` changes, cached per URL; until the new one
 * is known the previous colours stay; without art or on failure the fallback pair.
 */
export function useCoverPalette(artUrl: string | null | undefined): RefObject<Palette> {
  const ref = useRef<Palette>(covers.peek(artUrl) ?? FALLBACK_PALETTE);
  useEffect(() => {
    let current = true;
    const known = covers.peek(artUrl);
    if (known) {
      ref.current = known;
      return undefined;
    }
    covers
      .get(artUrl)
      .then((palette) => {
        if (current) ref.current = palette;
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [artUrl]);
  return ref;
}
