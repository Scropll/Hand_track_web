import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Point2 } from './gestures';

type ToScreen = (nx: number, ny: number) => Point2;

interface Shape {
  x: number; // center, in screen pixels
  y: number;
  r0: number; // fully clear inside this radius
  r1: number; // fully dark outside this radius
}

/** Clear area = this × your face size; dark edge starts at OUTER × face size. */
const INNER = 0.95;
const OUTER = 3.4;
/** After the face has been gone this long (ms), the vignette drifts back to the middle of the screen. */
const LOST_AFTER = 1000;

/**
 * The "dark magic" vignette: a clear circle around your face that fades to dark at the edges.
 * It moves the CSS gradient in #mood (see style.css) to follow your face.
 */
export class Vignette {
  enabled = true;
  private current: Shape;
  private target: Shape;
  private lastSeen = -Infinity;

  constructor(private readonly el: HTMLElement) {
    this.current = this.resting();
    this.target = this.resting();
    this.apply();
  }

  /** Where the vignette sits when no face is visible: centered, medium size. */
  private resting(): Shape {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const r0 = Math.min(W, H) * 0.2;
    return { x: W / 2, y: H / 2, r0, r1: Math.max(r0 + 200, Math.hypot(W, H) * 0.5) };
  }

  /** Face points used: 10 = forehead top, 152 = chin, 234 / 454 = face edges. */
  setFace(lm: NormalizedLandmark[], now: number, toScreen: ToScreen) {
    const P = (i: number) => toScreen(lm[i].x, lm[i].y);
    const top = P(10);
    const chin = P(152);
    const a = P(234);
    const b = P(454);
    const width = Math.hypot(b.x - a.x, b.y - a.y);
    const height = Math.hypot(top.x - chin.x, top.y - chin.y);
    const size = Math.max(width, height * 0.85); // stays steady when you turn your head
    const r0 = Math.max(60, size * INNER);
    this.target = { x: (top.x + chin.x) / 2, y: (top.y + chin.y) / 2, r0, r1: Math.max(r0 + 160, size * OUTER) };
    this.lastSeen = now;
  }

  /** Called every frame: glides smoothly toward the latest face position. */
  update(dt: number, now: number) {
    if (now - this.lastSeen > LOST_AFTER) this.target = this.resting();
    const k = 1 - Math.exp(-7 * dt);
    const c = this.current;
    const t = this.target;
    c.x += (t.x - c.x) * k;
    c.y += (t.y - c.y) * k;
    c.r0 += (t.r0 - c.r0) * k;
    c.r1 += (t.r1 - c.r1) * k;
    this.apply();
  }

  private apply() {
    const { x, y, r0, r1 } = this.current;
    const s = this.el.style;
    s.setProperty('--vx', `${x.toFixed(1)}px`);
    s.setProperty('--vy', `${y.toFixed(1)}px`);
    s.setProperty('--r0', `${r0.toFixed(1)}px`);
    s.setProperty('--r1', `${r1.toFixed(1)}px`);
  }
}
