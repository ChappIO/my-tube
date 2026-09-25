import type { FrameInput } from './visualizer';

/*
 * The visualizer's audio graph: `<audio>` → `MediaElementAudioSourceNode` → `AnalyserNode` →
 * destination, built once for the app's one `<audio>` element (`AudioEngine`).
 *
 * Once an element feeds a source node its sound only reaches the speakers through the context,
 * so the graph is built lazily, only while the page has a user activation (the click that starts
 * playback), and the context is resumed on every play. Where `AudioContext` is missing or throws,
 * nothing is built: the element plays as before and the visualizer drifts on synthetic
 * amplitudes.
 */

/** Analyser FFT size: 1024 bins, about 23 Hz each at 48 kHz. */
export const ANALYSER_FFT_SIZE = 2048;
/** The analyser's own smoothing; the bars add their ≈ 0.8 decay on top. */
export const ANALYSER_SMOOTHING = 0.6;

interface Graph {
  context: AudioContext;
  analyser: AnalyserNode;
  element: HTMLMediaElement;
  reader: NonNullable<FrameInput['analyser']>;
}

let graph: Graph | null = null;
/** Building failed once (no `AudioContext`, or it threw): do not try again. */
let unavailable = false;

/** Whether the page may start audio now (unknown counts as yes). */
function hasUserActivation(): boolean {
  return 'userActivation' in navigator ? navigator.userActivation.isActive : true;
}

/**
 * Called by `AudioEngine` right before it plays: builds the graph on the first play that comes
 * from a user gesture and resumes a suspended context on every play. Never throws; playback
 * does not depend on it.
 */
export function connectAnalyser(element: HTMLMediaElement): void {
  try {
    if (graph) {
      if (graph.element === element && graph.context.state === 'suspended') {
        graph.context.resume().catch(() => undefined);
      }
      return;
    }
    if (unavailable || !hasUserActivation()) return;
    if (typeof AudioContext !== 'function') {
      unavailable = true;
      return;
    }
    const context = new AudioContext();
    const source = context.createMediaElementSource(element);
    const analyser = context.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;
    source.connect(analyser);
    analyser.connect(context.destination);
    const reader = {
      read: (out: Uint8Array<ArrayBuffer>) => analyser.getByteFrequencyData(out),
      binCount: analyser.frequencyBinCount,
      sampleRate: context.sampleRate,
    };
    graph = { context, analyser, element, reader };
    if (context.state === 'suspended') context.resume().catch(() => undefined);
  } catch {
    unavailable = true;
  }
}

/** The analyser as the visualizer reads it, or null while there is none. */
export function currentAnalyser(): FrameInput['analyser'] {
  if (!graph || graph.context.state !== 'running') return null;
  return graph.reader;
}

/**
 * The visualizer's access to the analyser: a stable getter read every frame (the graph appears
 * with the first played track, possibly after the canvas mounted).
 */
export function useAnalyser(): () => FrameInput['analyser'] {
  return currentAnalyser;
}
