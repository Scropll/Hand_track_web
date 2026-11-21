import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Point2 } from './gestures';

/**
 * Clap detection from two tracked hands.
 *
 * Distances are measured in "palm lengths" (wrist → middle knuckle), so it works
 * near or far from the camera. A clap is: the hands were clearly apart, then
 * came together fast. When hands touch, MediaPipe often loses one of them, so
 * "two hands rushing together, then suddenly only one" counts as a clap too.
 */
const FAR = 2.2; // hands this many palm lengths apart count as "apart"
const NEAR = 1.2; // ...and this close as "together"
// If a hand vanishes while the two were this close and rushing together, they probably touched.
// It's generous because a fast clap moves more than a palm length between camera frames.
const MERGE_NEAR = 2.1;
const SWING_MS = 700; // the hands must go from apart to together within this time
const MIN_SPEED = 7; // ...closing at least this fast (palm lengths per second); a real clap is ~15
const SPEED_WINDOW_MS = 160; // closing speed is measured over this much time
const COOLDOWN_MS = 1200; // one clap at a time
const PALM = [0, 5, 9, 13, 17];

export class ClapDetector {
  private apartAt = -Infinity;
  private lastClap = -Infinity;
  private lastPair: { mid: Point2; d: number; t: number } | null = null;
  private recent: { d: number; t: number }[] = []; // hand distance over the last moments

  /**
   * Call on every new camera frame with the hand landmarks.
   * Returns where the clap happened (camera coordinates 0..1), or null.
   */
  update(hands: NormalizedLandmark[][], now: number, vw: number, vh: number): Point2 | null {
    if (hands.length >= 2) {
      const a = palm(hands[0], vw, vh);
      const b = palm(hands[1], vw, vh);
      const size = (a.size + b.size) / 2 || 1;
      const d = Math.hypot(a.x - b.x, a.y - b.y) / size;
      const mid = { x: (a.x + b.x) / 2 / vw, y: (a.y + b.y) / 2 / vh };
      this.lastPair = { mid, d, t: now };
      this.recent.push({ d, t: now });
      while (this.recent.length && now - this.recent[0].t > 400) this.recent.shift();
      if (d > FAR) this.apartAt = now;
      else if (d < NEAR) return this.clap(now, mid);
      return null;
    }
    // One hand (or none) left: did the two just meet?
    const pair = this.lastPair;
    if (pair && now - pair.t < 200 && pair.d < MERGE_NEAR) {
      this.lastPair = null;
      return this.clap(pair.t, pair.mid);
    }
    return null;
  }

  /** How fast the hands were closing in just before `t`, in palm lengths per second. */
  private closingSpeed(t: number): number {
    const last = this.recent.filter((r) => r.t <= t);
    if (last.length < 2) return 0;
    const end = last[last.length - 1];
    const start = last.find((r) => end.t - r.t <= SPEED_WINDOW_MS) ?? last[0];
    const dt = (end.t - start.t) / 1000;
    return dt > 0 ? (start.d - end.d) / dt : 0;
  }

  private clap(now: number, at: Point2): Point2 | null {
    if (now - this.apartAt > SWING_MS || now - this.lastClap < COOLDOWN_MS) return null;
    if (this.closingSpeed(now) < MIN_SPEED) return null; // hands drifting together slowly isn't a clap
    this.lastClap = now;
    this.apartAt = -Infinity; // the hands have to separate again before the next clap
    return at;
  }
}

function palm(lm: NormalizedLandmark[], vw: number, vh: number) {
  let x = 0;
  let y = 0;
  for (const i of PALM) {
    x += (lm[i].x * vw) / PALM.length;
    y += (lm[i].y * vh) / PALM.length;
  }
  const size = Math.hypot((lm[9].x - lm[0].x) * vw, (lm[9].y - lm[0].y) * vh);
  return { x, y, size };
}
