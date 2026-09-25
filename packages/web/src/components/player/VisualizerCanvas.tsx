import { useEffect, useRef } from 'react';
import { playerState } from '../../player-state';
import { cx } from '../ui/cx';
import { type Palette, glowPalette } from './palette';
import { useAnalyser } from './useAnalyser';
import { useCoverPalette } from './useCoverPalette';
import {
  type FrameInput,
  createAmplitudeState,
  createBarRenderer,
  createFrameLoop,
} from './visualizer';

/**
 * The visualizer's layer in the Now Playing panel: a full-size canvas over the blurred cover,
 * under the overlay (frontend skill "Player", "Visualizer"). It sizes the canvas to the panel at
 * `devicePixelRatio` (a `ResizeObserver`) and redraws it on one `requestAnimationFrame` loop: the
 * vignette and 56 bars in the cover's colours (`useCoverPalette`), driven by the analyser on the
 * app's `<audio>` (`useAnalyser`) while playing and by a slow synthetic drift while paused.
 * Nothing re-renders per frame. The loop stops while the page is hidden and when the panel
 * unmounts (leaving Now Playing).
 */
export function VisualizerCanvas({
  artUrl,
  className,
}: {
  artUrl: string | null | undefined;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useCoverPalette(artUrl);
  const analyser = useAnalyser();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;
    return runVisualizer(canvas, context, {
      palette: () => palette.current,
      input: () => ({ analyser: analyser(), playing: playerState().player?.playing ?? false }),
    });
  }, [palette, analyser]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cx('size-full', className)} />;
}

/** What the visualizer reads every frame. */
export interface VisualizerSource {
  palette: () => Palette;
  input: () => FrameInput;
}

/**
 * Runs the visualizer on a canvas until the returned cleanup: sizing (HiDPI, resize observer),
 * the frame loop, and stopping it while the document is hidden. The bars are lit in
 * `glowPalette` of the cover's colours: the rendered pair shows as `data-c1` / `data-c2` on the
 * canvas, the extracted one as `data-raw-c1` / `data-raw-c2`.
 */
export function runVisualizer(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  source: VisualizerSource,
  loopFactory: typeof createFrameLoop = createFrameLoop,
): () => void {
  let width = 0;
  let height = 0;
  let ratio = 1;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    ratio = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
  };
  resize();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);

  const state = createAmplitudeState();
  const renderer = createBarRenderer();
  let raw: Palette | null = null;
  let lit: Palette = glowPalette(source.palette());
  const loop = loopFactory((dt) => {
    const { amps, beat } = state.step(dt, source.input());
    const colours = source.palette();
    if (colours !== raw) {
      raw = colours;
      lit = glowPalette(colours);
      Object.assign(canvas.dataset, {
        c1: lit.c1,
        c2: lit.c2,
        rawC1: colours.c1,
        rawC2: colours.c2,
      });
    }
    renderer.draw(context, width, height, ratio, amps, beat, lit);
  });

  const onVisibility = () => {
    if (document.hidden) loop.stop();
    else loop.start();
  };
  document.addEventListener('visibilitychange', onVisibility);
  if (!document.hidden) loop.start();

  return () => {
    loop.stop();
    document.removeEventListener('visibilitychange', onVisibility);
    observer?.disconnect();
  };
}
