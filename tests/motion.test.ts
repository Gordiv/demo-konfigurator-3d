import { describe, expect, it } from 'vitest';
import { Tween, damp, easeInOutCubic, easeOutExpo, lerpAngle, wrapAngle } from '../src/motion';
import { cycle, resolveShortcut } from '../src/shortcuts';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('easing', () => {
  it('maps 0 → 0 and 1 → 1, clamping outside', () => {
    for (const f of [easeInOutCubic, easeOutExpo]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      expect(f(-1)).toBe(0);
      expect(f(2)).toBe(1);
    }
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });

  it('damps frame-rate independently', () => {
    const oneStep = damp(6, 1 / 30);
    const twoSteps = 1 - (1 - damp(6, 1 / 60)) ** 2;
    expect(oneStep).toBeCloseTo(twoSteps, 10);
  });
});

describe('angles', () => {
  it('wraps into [-PI, PI)', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI);
    expect(wrapAngle(2 * Math.PI + 0.25)).toBeCloseTo(0.25);
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5);
  });

  it('interpolates along the shorter arc', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1);
    expect(lerpAngle(0.2, 0.4, 0.5)).toBeCloseTo(0.3);
  });
});

describe('Tween', () => {
  it('moves from the current value to the target in time', () => {
    const t = new Tween(0, (x) => x);
    t.set(10, 1000, 100);
    expect(t.update(1050)).toBe(true);
    expect(t.value).toBeCloseTo(5);
    expect(t.update(1100)).toBe(false);
    expect(t.value).toBe(10);
  });

  it('retargets from wherever it currently is', () => {
    const t = new Tween(0, (x) => x);
    t.set(10, 0, 100);
    t.update(50);
    t.set(0, 50, 100);
    expect(t.from).toBeCloseTo(5);
  });

  it('jumps immediately with zero duration', () => {
    const t = new Tween(0);
    t.set(3, 0, 0);
    expect([t.value, t.active]).toEqual([3, false]);
  });
});

describe('shortcuts', () => {
  it('maps digits to models', () => {
    expect(resolveShortcut(key('1'))).toEqual({ type: 'shape', index: 0 });
    expect(resolveShortcut(key('6'))).toEqual({ type: 'shape', index: 5 });
    expect(resolveShortcut(key('7'))).toBeNull();
  });

  it('handles undo/redo with Ctrl or Cmd', () => {
    expect(resolveShortcut(key('z', { ctrlKey: true }))).toEqual({ type: 'undo' });
    expect(resolveShortcut(key('Z', { ctrlKey: true, shiftKey: true }))).toEqual({ type: 'redo' });
    expect(resolveShortcut(key('y', { metaKey: true }))).toEqual({ type: 'redo' });
    expect(resolveShortcut(key('s', { ctrlKey: true }))).toEqual({ type: 'save' });
    expect(resolveShortcut(key('c', { ctrlKey: true }))).toBeNull();
  });

  it('uses Shift to step backwards and ignores Alt', () => {
    expect(resolveShortcut(key('C', { shiftKey: true }))).toEqual({ type: 'color', step: -1 });
    expect(resolveShortcut(key('c'))).toEqual({ type: 'color', step: 1 });
    expect(resolveShortcut(key('c', { altKey: true }))).toBeNull();
  });

  it('maps views, toggles and dialogs', () => {
    expect(resolveShortcut(key('f'))).toEqual({ type: 'view', view: 'front' });
    expect(resolveShortcut(key('z'))).toEqual({ type: 'view', view: 'detail' });
    expect(resolveShortcut(key('w'))).toEqual({ type: 'toggle', what: 'dimensions' });
    expect(resolveShortcut(key('?', { shiftKey: true }))).toEqual({ type: 'open', what: 'help' });
    expect(resolveShortcut(key('Enter'))).toBeNull();
  });

  it('cycles through a list with wrap-around', () => {
    expect(cycle(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(cycle(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(cycle(['a', 'b', 'c'], 'x', 1)).toBe('b');
  });
});
