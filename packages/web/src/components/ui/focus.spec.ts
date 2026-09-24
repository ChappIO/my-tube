import { describe, expect, it } from 'vitest';
import { createLayerStack, wrapTarget } from './focus';

describe('wrapTarget', () => {
  const items = ['a', 'b', 'c'];

  it('lets the browser move focus between the ends', () => {
    expect(wrapTarget(items, 'a', false)).toBeNull();
    expect(wrapTarget(items, 'b', true)).toBeNull();
  });

  it('wraps from the last to the first and back', () => {
    expect(wrapTarget(items, 'c', false)).toBe('a');
    expect(wrapTarget(items, 'a', true)).toBe('c');
  });

  it('pulls focus back in when it is outside or on the dialog itself', () => {
    expect(wrapTarget(items, 'dialog', false)).toBe('a');
    expect(wrapTarget(items, null, true)).toBe('c');
  });

  it('does nothing without tabbable elements', () => {
    expect(wrapTarget([], 'a', false)).toBeNull();
  });
});

describe('createLayerStack', () => {
  it('only the most recently opened layer is on top', () => {
    const stack = createLayerStack();
    const outer = stack.push();
    const inner = stack.push();
    expect(stack.isTop(inner)).toBe(true);
    expect(stack.isTop(outer)).toBe(false);
    stack.remove(inner);
    expect(stack.isTop(outer)).toBe(true);
  });

  it('removing a lower layer keeps the top one on top', () => {
    const stack = createLayerStack();
    const outer = stack.push();
    const inner = stack.push();
    stack.remove(outer);
    expect(stack.isTop(inner)).toBe(true);
    expect(stack.size()).toBe(1);
  });
});
