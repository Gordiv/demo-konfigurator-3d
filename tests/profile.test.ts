import { describe, expect, it } from 'vitest';
import { OUTER_POINTS, OUTER_START, PROFILE_POINTS, SHAPE_MODULES, buildProfile, lerpProfile, profileMetrics, radiusAt } from '../src/profile';
import { SHAPES } from '../src/config';

describe('profiles', () => {
  it('every shape has the same number of points, so shapes can morph', () => {
    for (const shape of SHAPES) expect(buildProfile(shape.id)).toHaveLength(PROFILE_POINTS * 2);
  });

  it('starts and ends on the axis and never goes negative', () => {
    for (const shape of SHAPES) {
      const p = buildProfile(shape.id);
      expect(p[0]).toBe(0);
      expect(p[p.length - 2]).toBe(0);
      for (let i = 0; i < p.length; i++) {
        expect(Number.isFinite(p[i]!)).toBe(true);
        expect(p[i]!).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('keeps the inner wall inside the outer outline', () => {
    for (const shape of SHAPES) {
      const p = buildProfile(shape.id);
      const innerStart = OUTER_START + OUTER_POINTS + 2;
      for (let i = innerStart; i < PROFILE_POINTS - 1; i++) {
        const x = p[i * 2]!;
        const y = p[i * 2 + 1]!;
        expect(x).toBeLessThan(radiusAt(p, y) + 1e-3);
      }
    }
  });

  it('defines modules inside the product height', () => {
    for (const shape of SHAPES) {
      for (const m of SHAPE_MODULES[shape.id]) {
        expect(m.at).toBeGreaterThan(0);
        expect(m.at).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('lerpProfile (morph)', () => {
  const a = buildProfile('vase');
  const b = buildProfile('bowl');

  it('returns the endpoints at t = 0 and t = 1', () => {
    const out = new Float32Array(a.length);
    expect(Array.from(lerpProfile(out, a, b, 0))).toEqual(Array.from(a));
    expect(Array.from(lerpProfile(out, a, b, 1))).toEqual(Array.from(b));
  });

  it('interpolates every point linearly', () => {
    const out = lerpProfile(new Float32Array(a.length), a, b, 0.25);
    for (let i = 0; i < a.length; i++) expect(out[i]).toBeCloseTo(a[i]! + (b[i]! - a[i]!) * 0.25, 5);
  });

  it('writes into the given buffer without allocating and may alias an input', () => {
    const out = new Float32Array(a);
    const result = lerpProfile(out, out, b, 0.5);
    expect(result).toBe(out);
    expect(out[10]).toBeCloseTo((a[10]! + b[10]!) / 2, 5);
  });

  it('mid-morph metrics lie between both shapes', () => {
    const ma = profileMetrics(a);
    const mb = profileMetrics(b);
    const mid = profileMetrics(lerpProfile(new Float32Array(a.length), a, b, 0.5));
    expect(mid.height).toBeGreaterThan(Math.min(ma.height, mb.height) - 1e-6);
    expect(mid.height).toBeLessThan(Math.max(ma.height, mb.height) + 1e-6);
  });
});

describe('profileMetrics and radiusAt', () => {
  it('measures the vase', () => {
    const m = profileMetrics(buildProfile('vase'));
    expect(m.height).toBeCloseTo(1.74, 2);
    expect(m.maxRadius).toBeGreaterThan(0.69);
    expect(m.maxRadius).toBeLessThan(0.72);
    expect(m.baseRadius).toBeCloseTo(0.36, 2);
  });

  it('interpolates the radius along the outline', () => {
    const p = buildProfile('bottle');
    expect(radiusAt(p, -1)).toBeCloseTo(0.44, 2);
    expect(radiusAt(p, 0.5)).toBeCloseTo(0.52, 1);
    expect(radiusAt(p, 99)).toBeCloseTo(0.16, 2);
  });
});
