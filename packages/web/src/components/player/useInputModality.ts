import { useEffect } from 'react';

export type InputModality = 'pointer' | 'keyboard';

/**
 * What an input event says about how the viewer moves focus: a pointer or touch press is
 * `pointer`; Tab (with or without Shift) is `keyboard`. Other keys (the player's shortcuts, typing)
 * say nothing, so a clicked control keeps no ring when Space or C is pressed afterwards.
 */
export function modalityOf(event: { type: string; key?: string }): InputModality | null {
  if (event.type === 'pointerdown') return 'pointer';
  if (event.type === 'keydown' && event.key === 'Tab') return 'keyboard';
  return null;
}

/**
 * Keeps `data-input` on the root element up to date (`pointer` or `keyboard`), which the
 * `focus-ring-visible` utilities read. Mount once (the shell's `PlayerLayer`).
 */
export function useInputModality(): void {
  useEffect(() => {
    const root = document.documentElement;
    const onInput = (event: Event) => {
      const modality = modalityOf({
        type: event.type,
        key: event instanceof KeyboardEvent ? event.key : undefined,
      });
      if (modality && root.dataset.input !== modality) root.dataset.input = modality;
    };
    window.addEventListener('pointerdown', onInput, true);
    window.addEventListener('keydown', onInput, true);
    return () => {
      window.removeEventListener('pointerdown', onInput, true);
      window.removeEventListener('keydown', onInput, true);
      delete root.dataset.input;
    };
  }, []);
}
