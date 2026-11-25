import { SplineCurve, Vector2 } from 'three';
import type { ShapeId } from './config';

/**
 * Every product is a lathe of a closed 2D profile (radius, height) with the same number of points,
 * so two shapes can be morphed by interpolating the points pairwise.
 * Layout: [axis bottom, OUTER points bottom→top, 2 lip points, INNER points top→bottom, axis inner floor].
 */
export const OUTER_POINTS = 72;
export const INNER_POINTS = 44;
export const PROFILE_POINTS = 1 + OUTER_POINTS + 2 + INNER_POINTS + 1;
export const OUTER_START = 1;

interface ProfileSpec {
  outer: [number, number][];
  wall: number;
  innerBottom: number;
}

const SPECS: Record<ShapeId, ProfileSpec> = {
  vase: {
    outer: [[0.36, 0], [0.46, 0.06], [0.62, 0.32], [0.7, 0.62], [0.62, 0.98], [0.4, 1.26], [0.27, 1.46], [0.29, 1.62], [0.37, 1.74]],
    wall: 0.035,
    innerBottom: 0.14,
  },
  bottle: {
    outer: [[0.44, 0], [0.5, 0.05], [0.52, 0.3], [0.52, 0.72], [0.46, 0.96], [0.28, 1.14], [0.16, 1.3], [0.14, 1.56], [0.165, 1.66], [0.16, 1.74]],
    wall: 0.03,
    innerBottom: 1.2,
  },
  planter: {
    outer: [[0.5, 0], [0.57, 0.05], [0.64, 0.32], [0.72, 0.66], [0.79, 0.9], [0.86, 0.96], [0.87, 1.06]],
    wall: 0.06,
    innerBottom: 0.16,
  },
  amphora: {
    outer: [[0.24, 0], [0.31, 0.04], [0.33, 0.13], [0.26, 0.24], [0.4, 0.42], [0.6, 0.72], [0.64, 0.98], [0.52, 1.3], [0.3, 1.56], [0.22, 1.72], [0.24, 1.84], [0.31, 1.9]],
    wall: 0.032,
    innerBottom: 0.36,
  },
  bowl: {
    outer: [[0.32, 0], [0.4, 0.025], [0.58, 0.14], [0.78, 0.32], [0.92, 0.52], [0.99, 0.68], [1.01, 0.74]],
    wall: 0.04,
    innerBottom: 0.09,
  },
  goblet: {
    outer: [[0.42, 0], [0.44, 0.025], [0.32, 0.07], [0.12, 0.15], [0.085, 0.36], [0.095, 0.56], [0.2, 0.72], [0.42, 0.9], [0.54, 1.12], [0.57, 1.34], [0.56, 1.46]],
    wall: 0.03,
    innerBottom: 0.76,
  },
};

/** Real-world scale: the M-size vase (1.74 units) is 32 cm tall. */
export const CM_PER_UNIT = 18.4;

/** Named parts of each product, at a fraction of its height (dimensions mode). */
export const SHAPE_MODULES: Record<ShapeId, { label: string; at: number }[]> = {
  vase: [{ label: 'Kołnierz', at: 0.985 }, { label: 'Szyjka', at: 0.82 }, { label: 'Brzusiec', at: 0.36 }, { label: 'Stopka', at: 0.03 }],
  bottle: [{ label: 'Szyjka', at: 0.86 }, { label: 'Ramię', at: 0.6 }, { label: 'Korpus', at: 0.3 }, { label: 'Dno', at: 0.02 }],
  planter: [{ label: 'Kołnierz', at: 0.95 }, { label: 'Ścianka', at: 0.5 }, { label: 'Stopka', at: 0.03 }],
  amphora: [{ label: 'Wylew', at: 0.99 }, { label: 'Szyjka', at: 0.88 }, { label: 'Brzusiec', at: 0.48 }, { label: 'Stopka', at: 0.05 }],
  bowl: [{ label: 'Krawędź', at: 0.97 }, { label: 'Czasza', at: 0.5 }, { label: 'Stopka', at: 0.03 }],
  goblet: [{ label: 'Krawędź', at: 0.99 }, { label: 'Czasza', at: 0.72 }, { label: 'Nóżka', at: 0.3 }, { label: 'Stopa', at: 0.015 }],
};

/** Arc-length parameter u where the outline reaches height y (outlines rise monotonically). */
function paramAtHeight(curve: SplineCurve, y: number): number {
  let lo = 0;
  let hi = 1;
  const p = new Vector2();
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    curve.getPointAt(mid, p);
    if (p.y < y) lo = mid;
    else hi = mid;
  }
  return hi;
}

const cache = new Map<ShapeId, Float32Array>();

/** The fixed-size profile of a shape as interleaved (x, y) pairs. Built once per shape; treat as read-only. */
export function buildProfile(shape: ShapeId): Float32Array {
  let profile = cache.get(shape);
  if (!profile) {
    profile = computeProfile(shape);
    cache.set(shape, profile);
  }
  return profile;
}

function computeProfile(shape: ShapeId): Float32Array {
  const { outer, wall, innerBottom } = SPECS[shape];
  const curve = new SplineCurve(outer.map(([x, y]) => new Vector2(x, y)));
  const out = new Float32Array(PROFILE_POINTS * 2);
  let k = 0;
  const put = (x: number, y: number) => {
    out[k++] = Math.max(x, 0);
    out[k++] = Math.max(y, 0);
  };

  put(0, 0);
  const outline = curve.getSpacedPoints(OUTER_POINTS - 1);
  for (const p of outline) put(p.x, p.y);
  const top = outline[outline.length - 1]!;
  put(top.x - wall * 0.5, top.y + wall * 0.3);
  put(top.x - wall, top.y);

  // Inner wall: the outline offset inwards along its normal, from just below the rim down to the floor.
  const start = paramAtHeight(curve, innerBottom);
  const p = new Vector2();
  const t = new Vector2();
  let floorY = innerBottom;
  for (let i = 0; i < INNER_POINTS; i++) {
    const u = 1 - ((i + 1) / INNER_POINTS) * (1 - start);
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    // Outward normal of an upward outline is (t.y, -t.x).
    const x = Math.max(p.x - t.y * wall, 0.004);
    const y = p.y + t.x * wall;
    put(x, y);
    floorY = y;
  }
  put(0, floorY);
  return out;
}

/** out = a + (b - a) * t, pointwise. `out` may alias `a` or `b`. */
export function lerpProfile(out: Float32Array, a: Float32Array, b: Float32Array, t: number): Float32Array {
  for (let i = 0; i < out.length; i++) out[i] = a[i]! + (b[i]! - a[i]!) * t;
  return out;
}

export interface ProfileMetrics {
  height: number;
  maxRadius: number;
  widestY: number;
  rimRadius: number;
  baseRadius: number;
}

/** Writes measurements of the outer outline into `out` (no allocation when `out` is given). */
export function profileMetrics(profile: Float32Array, out: ProfileMetrics = { height: 0, maxRadius: 0, widestY: 0, rimRadius: 0, baseRadius: 0 }): ProfileMetrics {
  let maxR = 0;
  let widestY = 0;
  let height = 0;
  for (let i = OUTER_START; i < OUTER_START + OUTER_POINTS; i++) {
    const x = profile[i * 2]!;
    const y = profile[i * 2 + 1]!;
    if (x > maxR) {
      maxR = x;
      widestY = y;
    }
    if (y > height) height = y;
  }
  out.height = height;
  out.maxRadius = maxR;
  out.widestY = widestY;
  out.rimRadius = profile[(OUTER_START + OUTER_POINTS - 1) * 2]!;
  out.baseRadius = profile[OUTER_START * 2]!;
  return out;
}

/** Outer radius at height y, linearly interpolated along the outline. */
export function radiusAt(profile: Float32Array, y: number): number {
  let px = profile[OUTER_START * 2]!;
  let py = profile[OUTER_START * 2 + 1]!;
  if (y <= py) return px;
  for (let i = OUTER_START + 1; i < OUTER_START + OUTER_POINTS; i++) {
    const x = profile[i * 2]!;
    const yy = profile[i * 2 + 1]!;
    if (yy >= y) return yy === py ? x : px + ((x - px) * (y - py)) / (yy - py);
    px = x;
    py = yy;
  }
  return px;
}
