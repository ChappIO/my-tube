import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeAdd, isAddOpen, openAdd, subscribeUiState } from './ui-state';

describe('Add modal state', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    closeAdd();
    vi.restoreAllMocks();
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
