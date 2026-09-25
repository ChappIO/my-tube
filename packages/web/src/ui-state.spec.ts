import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeAdd,
  closeJobLog,
  closePreview,
  isAddOpen,
  jobLogTarget,
  openAdd,
  openJobLog,
  openPreview,
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
    openPreview(5);
    expect(previewTarget()).toEqual({ kind: 'video', id: 5 });
    closePreview();
    closePreview();
    expect(previewTarget()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it('keys each target', () => {
    expect(previewKey({ kind: 'video', id: 4 })).toBe('video:4');
  });
});

describe('Log viewer state', () => {
  afterEach(() => {
    closeJobLog();
  });

  it('shows one job at a time and notifies on changes only', () => {
    const listener = vi.fn<() => void>();
    const unsubscribe = subscribeUiState(listener);
    expect(jobLogTarget()).toBeNull();
    openJobLog(7);
    openJobLog(7);
    expect(jobLogTarget()).toBe(7);
    expect(listener).toHaveBeenCalledTimes(1);
    openJobLog(8);
    expect(jobLogTarget()).toBe(8);
    closeJobLog();
    closeJobLog();
    expect(jobLogTarget()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
