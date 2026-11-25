export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const easeInOutCubic = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);

export const easeOutExpo = (t: number): number => {
  const x = clamp01(t);
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Wraps an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let x = (a + Math.PI) % twoPi;
  if (x < 0) x += twoPi;
  return x - Math.PI;
}

/** Interpolates angles along the shorter arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/** Frame-rate independent exponential approach factor for `dt` seconds. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** A value animated from `from` to `to` over `duration` ms with an easing curve. */
export class Tween {
  from = 0;
  to = 0;
  value = 0;
  private start = 0;
  private duration = 0;
  private easing: (t: number) => number;
  active = false;

  constructor(initial: number, easing: (t: number) => number = easeOutCubic) {
    this.value = this.from = this.to = initial;
    this.easing = easing;
  }

  set(to: number, now: number, duration: number): void {
    this.from = this.value;
    this.to = to;
    this.start = now;
    this.duration = duration;
    this.active = duration > 0 && to !== this.value;
    if (!this.active) this.value = to;
  }

  /** Advances to `now`; returns true while still moving. */
  update(now: number): boolean {
    if (!this.active) return false;
    const t = this.duration > 0 ? (now - this.start) / this.duration : 1;
    if (t >= 1) {
      this.value = this.to;
      this.active = false;
      return false;
    }
    this.value = lerp(this.from, this.to, this.easing(t));
    return true;
  }
}
