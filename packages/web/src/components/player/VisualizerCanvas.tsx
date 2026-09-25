import { cx } from '../ui/cx';

/**
 * The visualizer's layer in the Now Playing panel: a full-size canvas over the blurred cover,
 * under the overlay. For now it only holds the place and stays transparent, so the blurred cover
 * shows through.
 *
 * The seam for the visualizer: this component owns the canvas. It sizes it to the panel at
 * `devicePixelRatio`, clears it every animation frame, paints the radial vignette and the 56
 * bars from an `AnalyserNode` on `AudioEngine`'s `<audio>` element, in the two colours picked
 * from the cover (frontend skill "Player", "Visualizer"). Nothing outside it changes.
 */
export function VisualizerCanvas({ className }: { className?: string }) {
  return <canvas aria-hidden="true" className={cx('size-full', className)} />;
}
