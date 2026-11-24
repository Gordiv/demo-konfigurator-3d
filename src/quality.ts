/** Frames slower than this (ms, smoothed) count as lagging. */
const SLOW_MS = 24;
/** Frames faster than this (ms, smoothed) count as stable. */
const FAST_MS = 14;
/** Gaps longer than this are idle time between renders, not frame time. */
const MAX_SAMPLE_MS = 100;
const SLOW_WINDOW_MS = 1000;
const STABLE_WINDOW_MS = 5000;
const MAX_DOWNGRADES = 2;

/**
 * Lowers the pixel ratio to `min` when rendering stays slow and restores it once frames are stable again.
 * After the second downgrade it stays at `min` to avoid oscillating.
 */
export class AdaptivePixelRatio {
  current: number;
  private readonly max: number;
  private readonly min: number;
  private average = 16.7;
  private slowFor = 0;
  private stableFor = 0;
  private downgrades = 0;

  constructor(max: number, min = 1) {
    this.max = max;
    this.min = min;
    this.current = max;
  }

  /** Feeds the time between two consecutive rendered frames. Returns the new ratio when it changes. */
  sample(frameMs: number): number | null {
    if (!(frameMs > 0) || frameMs > MAX_SAMPLE_MS || this.max <= this.min) return null;
    this.average += (frameMs - this.average) * 0.1;

    if (this.average > SLOW_MS && this.current > this.min) {
      this.stableFor = 0;
      this.slowFor += frameMs;
      if (this.slowFor >= SLOW_WINDOW_MS) return this.change(this.min, true);
      return null;
    }
    this.slowFor = 0;

    if (this.average < FAST_MS && this.current < this.max && this.downgrades < MAX_DOWNGRADES) {
      this.stableFor += frameMs;
      if (this.stableFor >= STABLE_WINDOW_MS) return this.change(this.max, false);
    } else {
      this.stableFor = 0;
    }
    return null;
  }

  private change(ratio: number, downgrade: boolean): number {
    if (downgrade) this.downgrades++;
    this.current = ratio;
    this.average = 16.7;
    this.slowFor = 0;
    this.stableFor = 0;
    return ratio;
  }
}
