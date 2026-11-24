import { describe, expect, it } from 'vitest';
import { AdaptivePixelRatio } from '../src/quality';

/** Feeds `durationMs` worth of frames of `frameMs` each and returns every ratio change. */
function feed(quality: AdaptivePixelRatio, frameMs: number, durationMs: number): number[] {
  const changes: number[] = [];
  for (let elapsed = 0; elapsed < durationMs; elapsed += frameMs) {
    const ratio = quality.sample(frameMs);
    if (ratio !== null) changes.push(ratio);
  }
  return changes;
}

describe('AdaptivePixelRatio', () => {
  it('keeps the ratio while frames are fast', () => {
    const quality = new AdaptivePixelRatio(2);
    expect(feed(quality, 16.7, 10_000)).toEqual([]);
    expect(quality.current).toBe(2);
  });

  it('drops to 1 when frames stay slow', () => {
    const quality = new AdaptivePixelRatio(2);
    expect(feed(quality, 33, 3000)).toEqual([1]);
    expect(quality.current).toBe(1);
  });

  it('ignores a single slow frame', () => {
    const quality = new AdaptivePixelRatio(2);
    feed(quality, 16.7, 1000);
    expect(quality.sample(60)).toBeNull();
    expect(feed(quality, 16.7, 2000)).toEqual([]);
    expect(quality.current).toBe(2);
  });

  it('ignores idle gaps between renders', () => {
    const quality = new AdaptivePixelRatio(2);
    expect(feed(quality, 500, 20_000)).toEqual([]);
    expect(quality.sample(0)).toBeNull();
    expect(quality.sample(Number.NaN)).toBeNull();
  });

  it('restores the ratio once stable, then stays low after a second drop', () => {
    const quality = new AdaptivePixelRatio(2);
    expect(feed(quality, 33, 2000)).toEqual([1]);
    expect(feed(quality, 8, 6000)).toEqual([2]);
    expect(feed(quality, 33, 2000)).toEqual([1]);
    expect(feed(quality, 8, 20_000)).toEqual([]);
    expect(quality.current).toBe(1);
  });

  it('does nothing on screens with a pixel ratio of 1', () => {
    const quality = new AdaptivePixelRatio(1);
    expect(feed(quality, 50, 5000)).toEqual([]);
    expect(quality.current).toBe(1);
  });
});
