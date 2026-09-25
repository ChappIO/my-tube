import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeAdd,
  closePreview,
  isAddOpen,
  openAdd,
  openEmptyPreview,
  openPreview,
  openTrackPreview,
  previewKey,
  previewTarget,
  subscribeUiState,
} from './ui-state';

describe('Add modal state', () => {
  afterEach(() => {
    closeAdd();
  });

  it('starts closed and toggles with openAdd and closeAdd', () => {
    expect(isAddOpen()).toBe(false);
    openAdd();
    expect(isAddOpen()).toBe(true);
    closeAdd();
    expect(isAddOpen()).toBe(false);
  });

  it('notifies subscribers on changes only, until they unsubscribe', () => {
    const listener = vi.fn<() => void>();
    const unsubscribe = subscribeUiState(listener);
    openAdd();
    openAdd();
    expect(listener).toHaveBeenCalledTimes(1);
    closeAdd();
    closeAdd();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    openAdd();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('Preview state', () => {
  afterEach(() => {
    closePreview();
  });

  it('holds what is being previewed and notifies on changes only', () => {
    const listener = vi.fn<() => void>();
    const unsubscribe = subscribeUiState(listener);
    expect(previewTarget()).toBeNull();
    openPreview(4);
    openPreview(4);
    expect(previewTarget()).toEqual({ kind: 'video', id: 4 });
    openTrackPreview(4);
    expect(previewTarget()).toEqual({ kind: 'track', id: 4 });
    openEmptyPreview('First Light');
    openEmptyPreview('First Light');
    expect(previewTarget()).toEqual({ kind: 'empty', title: 'First Light' });
    closePreview();
    closePreview();
    expect(previewTarget()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
  });

  it('keys each target', () => {
    expect(previewKey({ kind: 'video', id: 4 })).toBe('video:4');
    expect(previewKey({ kind: 'track', id: 4 })).toBe('track:4');
    expect(previewKey({ kind: 'empty', title: 'X' })).toBe('empty:X');
  });
});
