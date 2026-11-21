import type { Point2 } from './gestures';

/**
 * "Draw three circles with a pointing finger" detection.
 *
 * Adds up how much the fingertip's path turns: each full circle is 360°, in either
 * direction. Wiggling back and forth cancels itself out, so only real loops count.
 * Distances are in palm lengths, so it works near or far from the camera.
 */
const TURNS = 3; // circles needed
const TOLERANCE = 0.15; // ...minus this much of a turn (a slightly short last loop still counts)
const STEP = 0.18; // only sample the fingertip after it moved this far (palm lengths): ignores jitter
const MIN_LOOP_SIZE = 0.7; // loops smaller than this (palm lengths across) are just jitter
const WINDOW_MS = 6000; // all three circles within this time
const GRACE_MS = 300; // pointing may flicker briefly without resetting
const COOLDOWN_MS = 1500;

export class CircleDetector {
  private pts: { x: number; y: number; t: number }[] = [];
  private turns: { a: number; t: number }[] = []; // signed turning angle at each sample
  private notPointingSince = 0;
  private lastFire = -Infinity;

  /**
   * Call on every new camera frame for one hand.
   * `tip` is the index fingertip and `palm` the palm length, both in camera pixels.
   * Returns true once, when the third circle is completed.
   */
  update(tip: Point2, palm: number, pointing: boolean, now: number): boolean {
    if (!pointing) {
      if (!this.notPointingSince) this.notPointingSince = now;
      if (now - this.notPointingSince > GRACE_MS) this.reset();
      return false;
    }
    this.notPointingSince = 0;
    if (now - this.lastFire < COOLDOWN_MS) return false;

    const step = Math.max(4, STEP * palm);
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(tip.x - last.x, tip.y - last.y) < step) return false;
    this.pts.push({ x: tip.x, y: tip.y, t: now });

    // The turn between the last two moves.
    const n = this.pts.length;
    if (n >= 3) {
      const [a, b, c] = [this.pts[n - 3], this.pts[n - 2], this.pts[n - 1]];
      const h1 = Math.atan2(b.y - a.y, b.x - a.x);
      const h2 = Math.atan2(c.y - b.y, c.x - b.x);
      let d = h2 - h1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.turns.push({ a: d, t: now });
    }
    while (this.pts.length && now - this.pts[0].t > WINDOW_MS) this.pts.shift();
    while (this.turns.length && now - this.turns[0].t > WINDOW_MS) this.turns.shift();

    const total = Math.abs(this.turns.reduce((s, x) => s + x.a, 0)) / (2 * Math.PI);
    if (total < TURNS - TOLERANCE) return false;

    // Make sure the loops were real circles, not tiny jitter.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of this.pts) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    if (Math.min(x1 - x0, y1 - y0) < MIN_LOOP_SIZE * palm) return false;

    this.lastFire = now;
    this.reset();
    return true;
  }

  reset() {
    this.pts = [];
    this.turns = [];
    this.notPointingSince = 0;
  }
}
