import type { Point2 } from './gestures';

const IMAGE_URL = `${import.meta.env.BASE_URL}costume/pinch-character.png`;
const ASPECT = 208 / 355; // height / width of the picture
const POP_MS = 380; // pop in with a bounce
const STAY_MS = 1500; // bob happily in place
const LEAVE_MS = 700; // float up and fade away
const MAX_ON_SCREEN = 4;

interface Pop {
  el: HTMLImageElement;
  start: number;
  at: Point2;
  size: number;
  spin: number; // a little random tilt so repeated pinches don't look identical
}

/** The pinch character: pops up where you pinched, bobs for a moment, then floats away. */
export class CharacterPops {
  private pops: Pop[] = [];

  constructor(private readonly layer: HTMLElement) {
    new Image().src = IMAGE_URL; // load it now so the first pinch is instant
  }

  launch(at: Point2) {
    if (this.pops.length >= MAX_ON_SCREEN) this.remove(this.pops[0]);
    const size = Math.min(window.innerWidth * 0.22, window.innerHeight * 0.32, 260);
    const el = document.createElement('img');
    el.src = IMAGE_URL;
    el.alt = '';
    el.className = 'pop-character';
    el.style.width = `${size}px`;
    this.layer.appendChild(el);
    this.pops.push({ el, start: performance.now(), at: { ...at }, size, spin: (Math.random() - 0.5) * 16 });
  }

  update(now: number) {
    for (const p of [...this.pops]) {
      const age = now - p.start;
      if (age > POP_MS + STAY_MS + LEAVE_MS) {
        this.remove(p);
        continue;
      }
      let scale = 1;
      let dy = 0;
      let tilt = p.spin;
      let opacity = 1;
      if (age < POP_MS) {
        // Pop: overshoot a little, then settle (an elastic ease).
        const k = age / POP_MS;
        scale = 1 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.35 - (1 - k) ** 3;
        dy = -(1 - k) * 20;
      } else if (age < POP_MS + STAY_MS) {
        // Bob up and down and wiggle, like it's saying hi.
        const s = (age - POP_MS) / 1000;
        dy = -Math.abs(Math.sin(s * 5)) * 14;
        tilt = p.spin + Math.sin(s * 7) * 6;
      } else {
        // Float up and fade out.
        const k = (age - POP_MS - STAY_MS) / LEAVE_MS;
        dy = -k * k * 120;
        scale = 1 - k * 0.2;
        opacity = 1 - k;
      }
      const w = p.size;
      const h = w * ASPECT;
      p.el.style.transform = `translate(${p.at.x - w / 2}px, ${p.at.y - h / 2 + dy}px) rotate(${tilt}deg) scale(${Math.max(0.01, scale)})`;
      p.el.style.opacity = String(opacity);
    }
  }

  private remove(p: Pop) {
    p.el.remove();
    this.pops = this.pops.filter((x) => x !== p);
  }
}
