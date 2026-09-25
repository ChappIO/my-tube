import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeAdd,
  closePreview,
  isAddOpen,
  openAdd,
  openPreview,
  previewVideoId,
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

  it('holds the video being previewed and notifies on changes only', () => {
    const listener = vi.fn<() => void>();
    const unsubscribe = subscribeUiState(listener);
    expect(previewVideoId()).toBeNull();
    openPreview(4);
    openPreview(4);
    expect(previewVideoId()).toBe(4);
    openPreview(5);
    expect(previewVideoId()).toBe(5);
    closePreview();
    closePreview();
    expect(previewVideoId()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
