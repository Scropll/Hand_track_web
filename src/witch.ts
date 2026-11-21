import type { Point2 } from './gestures';

const WITCH_URL = `${import.meta.env.BASE_URL}costume/witch-broom.webp`;
const WITCH_ASPECT = 478 / 640; // height / width of the picture
const TAIL = { x: 0.1, y: 0.66 }; // the glowing broom tail, as a fraction of the picture
const POP_MS = 450; // the pop-in at the clap
const FLY_MS = 3000; // the swoop around the screen and away
const MAX_WITCHES = 3;

interface Flight {
  el: HTMLImageElement;
  start: number;
  path: [Point2, Point2, Point2, Point2]; // a curve in screen pixels
  size: number; // width in px
}

/**
 * The witch on a broomstick: pops out where you clapped, swoops around the
 * screen and flies away, scattering gold sparkles from her broom.
 */
export class WitchFlights {
  private flights: Flight[] = [];

  constructor(
    private readonly layer: HTMLElement,
    /** Called each frame with the broom tail's screen position, to leave sparkles behind. */
    private readonly sparkle: (p: Point2, dt: number) => void,
  ) {
    // Load the picture right away so the first clap doesn't wait for it.
    new Image().src = WITCH_URL;
  }

  launch(at: Point2) {
    if (this.flights.length >= MAX_WITCHES) this.remove(this.flights[0]);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const size = Math.min(W * 0.32, H * 0.42, 360);
    // Rise up and to one side, sweep across the top, then dive out the far side.
    // She flies toward whichever side has more room.
    const dir = at.x < W / 2 ? 1 : -1;
    const path: Flight['path'] = [
      { ...at },
      { x: at.x - dir * W * 0.35, y: at.y - H * 0.55 },
      { x: at.x + dir * W * 0.55, y: -H * 0.25 },
      { x: dir > 0 ? W + size : -size, y: H * 0.3 },
    ];
    const el = document.createElement('img');
    el.src = WITCH_URL;
    el.alt = '';
    el.className = 'witch';
    el.style.width = `${size}px`;
    this.layer.appendChild(el);
    this.flights.push({ el, start: performance.now(), path, size });
  }

  update(now: number, dt: number) {
    for (const f of [...this.flights]) {
      const age = now - f.start;
      if (age > POP_MS + FLY_MS) {
        this.remove(f);
        continue;
      }
      let pos: Point2;
      let scale: number;
      let tilt: number;
      let facing: number;
      if (age < POP_MS) {
        // Pop: grow from nothing with a little overshoot, hovering at the clap.
        const k = age / POP_MS;
        scale = k < 0.7 ? (k / 0.7) * 1.15 : 1.15 - ((k - 0.7) / 0.3) * 0.15;
        pos = f.path[0];
        tilt = Math.sin(k * Math.PI * 2) * 8;
        facing = f.path[3].x > f.path[0].x ? 1 : -1;
      } else {
        const t = easeInOut((age - POP_MS) / FLY_MS);
        pos = bezier(f.path, t);
        const ahead = bezier(f.path, Math.min(1, t + 0.01));
        const vx = ahead.x - pos.x;
        const vy = ahead.y - pos.y;
        facing = vx >= 0 ? 1 : -1; // the picture faces right; flip it when flying left
        tilt = Math.max(-35, Math.min(35, (Math.atan2(vy, Math.abs(vx)) * 180) / Math.PI));
        scale = 1 - 0.25 * t; // a bit smaller as she flies off into the distance
      }
      const w = f.size;
      const h = w * WITCH_ASPECT;
      f.el.style.transform =
        `translate(${pos.x - w / 2}px, ${pos.y - h / 2}px) rotate(${tilt * facing}deg) scale(${scale * facing}, ${scale})`;
      f.el.style.opacity = String(Math.min(1, age / 120));

      // The broom tail, in screen pixels (mirrored with the picture when she faces left).
      const tx = (TAIL.x - 0.5) * w * scale * facing;
      const ty = (TAIL.y - 0.5) * h * scale;
      const r = (tilt * facing * Math.PI) / 180;
      this.sparkle({ x: pos.x + tx * Math.cos(r) - ty * Math.sin(r), y: pos.y + tx * Math.sin(r) + ty * Math.cos(r) }, dt);
    }
  }

  get active() {
    return this.flights.length;
  }

  private remove(f: Flight) {
    f.el.remove();
    this.flights = this.flights.filter((x) => x !== f);
  }
}

function bezier([a, b, c, d]: Flight['path'], t: number): Point2 {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
