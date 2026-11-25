import { describe, expect, it } from 'vitest';
import { History } from '../src/history';
import { DEFAULT_CONFIG, sameConfig, type Config } from '../src/config';

describe('History', () => {
  it('undoes and redoes in order', () => {
    const h = new History(0);
    h.push(1);
    h.push(2);
    expect(h.current).toBe(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe(1);
    expect(h.redo()).toBe(2);
    expect(h.redo()).toBeNull();
  });

  it('drops the redo branch on a new push', () => {
    const h = new History('a');
    h.push('b');
    h.push('c');
    h.undo();
    h.push('d');
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe('b');
  });

  it('ignores states equal to the current one', () => {
    const h = new History<Config>(DEFAULT_CONFIG, sameConfig);
    expect(h.push({ ...DEFAULT_CONFIG, extras: [] })).toBe(false);
    expect(h.canUndo).toBe(false);
    expect(h.push({ ...DEFAULT_CONFIG, size: 'l' })).toBe(true);
    expect(h.canUndo).toBe(true);
  });

  it('keeps at most `limit` undo steps', () => {
    const h = new History<number>(0, Object.is, 3);
    for (let i = 1; i <= 10; i++) h.push(i);
    let steps = 0;
    while (h.undo() !== null) steps++;
    expect(steps).toBe(3);
    expect(h.current).toBe(7);
  });

  it('reports availability flags', () => {
    const h = new History(0);
    expect([h.canUndo, h.canRedo]).toEqual([false, false]);
    h.push(1);
    expect([h.canUndo, h.canRedo]).toEqual([true, false]);
    h.undo();
    expect([h.canUndo, h.canRedo]).toEqual([false, true]);
  });

  it('resets to a single state', () => {
    const h = new History(0);
    h.push(1);
    h.push(2);
    h.undo();
    h.reset(9);
    expect([h.current, h.canUndo, h.canRedo]).toEqual([9, false, false]);
  });
});
