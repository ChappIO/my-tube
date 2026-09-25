import { type PlayerState, type VolumeTarget, applyVolume } from '../../player-state';
import { analyserConnected, setOutputVolume } from './useAnalyser';

/** Where the music's level goes when the visualizer's graph carries the sound. */
export interface GainOutput<E> {
  /** Whether the element plays through the graph. */
  connected: (element: E) => boolean;
  /** Sets the graph's gain (0 when muted). */
  set: (volume: number, muted: boolean) => void;
}

/** The real graph of `useAnalyser.ts`. */
export const analyserOutput: GainOutput<HTMLMediaElement> = {
  connected: analyserConnected,
  set: setOutputVolume,
};

/**
 * Applies the store's volume and mute to the music. Through the visualizer's graph the element
 * stays at full volume and unmuted, so the analyser reads the full signal, and the level is the
 * gain node after it; without a graph (no `AudioContext`, or not built yet) the element's own
 * `volume` and `muted` carry it. `AudioEngine` calls it on every change, every load and right
 * after `connectAnalyser`, so switching from the element to the graph re-applies the level.
 */
export function applyAudioVolume<E extends VolumeTarget>(
  element: E,
  level: Pick<PlayerState, 'volume' | 'muted'>,
  output: GainOutput<E>,
): void {
  if (output.connected(element)) {
    applyVolume(element, { volume: 1, muted: false });
    output.set(level.volume, level.muted);
  } else {
    applyVolume(element, level);
  }
}
