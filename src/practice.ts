import type { Point2 } from './gestures';
import type { Rect } from './portrait';
import { resample, smoothPath, pathLength } from './spellPath';
import type { Spell } from './spells.js';

/** The guide symbol's size, as a fraction of the screen height. */
const GUIDE_SIZE = 0.6;
/** How far the wand tip may stray from the path, as a fraction of the screen width. */
const CORRIDOR = 0.08;
/** Leaving the path for longer than this resets the attempt. */
const OFF_PATH_MS = 500;
/** How long the progress takes to drain away after a failed attempt. */
const FAIL_FADE_MS = 700;
/** After a success, return to the Spellbook after this long. */
const SUCCESS_HOLD_MS = 2500;
/** Progress may jump at most this far ahead along the path in one step (× corridor width). */
const LOOKAHEAD = 2.5;
const GUIDE_SPACING = 4; // px between points of the dense guide path
/** Reaching this close to the end of the path (× corridor width) completes it. */
const END_SLACK = 0.33;

type State = 'waiting' | 'tracing' | 'failed' | 'success';

export interface SuccessInfo {
  tip: Point2; // where the spell ended (screen pixels)
  dir: Point2; // direction of the path's final stretch (screen pixels, y down, unit length)
}

/**
 * Practice mode. The spell's motion is drawn large in the middle of the screen.
 * Touch the start dot with the wand tip, then follow the line: the traced part fills in gold.
 * Stray outside the corridor for more than half a second and it resets.
 */
export class Practice {
  spell: Spell | null = null;
  private state: State = 'waiting';
  private guide: Point2[] = []; // dense path in screen pixels
  private dist: number[] = []; // distance along the path to each guide point
  private tol = 60; // corridor half-width in px
  private index = 0; // how far along the guide the wand has reached
  private shown = 0; // displayed progress 0..1 (eases toward the real progress)
  private offSince = 0;
  private stateSince = 0;
  private failedFrom = 0;
  private lastStatus = '';

  private readonly ctx: CanvasRenderingContext2D;
  private readonly nameEl: HTMLElement;
  private readonly descEl: HTMLElement;
  private readonly meterFill: HTMLElement;
  private readonly meterLabel: HTMLElement;
  private readonly statusEl: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly onSuccess: (spell: Spell, info: SuccessInfo) => void,
    private readonly onDone: () => void,
    /** Where the camera picture is shown (the gold frame's opening in the Hall), or null for the full screen. */
    private readonly getRegion: () => Rect | null = () => null,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    this.nameEl = q('.practice-name');
    this.descEl = q('.practice-desc');
    this.meterFill = q('.meter-fill');
    this.meterLabel = q('.meter-label');
    this.statusEl = q('.practice-status');
    window.addEventListener('resize', () => this.layout());
  }

  get active() {
    return this.spell !== null;
  }

  start(spell: Spell) {
    this.spell = spell;
    this.nameEl.textContent = spell.name;
    this.descEl.textContent = spell.description;
    this.root.hidden = false;
    this.canvas.hidden = false;
    this.layout();
    this.setState('waiting', performance.now());
  }

  stop() {
    this.spell = null;
    this.root.hidden = true;
    this.canvas.hidden = true;
  }

  /** Call every frame with the wand tip in screen pixels (null when lost). */
  update(p: Point2 | null, now: number, time: number) {
    if (!this.spell) return;
    const n = this.guide.length;
    const progress = () => (n > 1 ? this.dist[this.index] / this.dist[n - 1] : 0);

    switch (this.state) {
      case 'waiting': {
        const start = this.guide[0];
        if (p && Math.hypot(p.x - start.x, p.y - start.y) <= this.tol) {
          this.index = 0;
          this.offSince = 0;
          this.setState('tracing', now);
        }
        this.shown = 0;
        break;
      }
      case 'tracing': {
        const hit = p ? this.follow(p) : false;
        if (hit) this.offSince = 0;
        else if (!this.offSince) this.offSince = now;
        else if (now - this.offSince > OFF_PATH_MS) {
          this.failedFrom = this.shown;
          this.setState('failed', now);
          break;
        }
        // Done when the wand reaches the end of the path (close enough: hands wobble).
        if (this.dist[n - 1] - this.dist[this.index] <= this.tol * END_SLACK) {
          this.index = n - 1;
          this.shown = 1;
          this.setState('success', now);
          this.onSuccess(this.spell, { tip: this.guide[n - 1], dir: this.endDirection() });
          break;
        }
        this.shown += (progress() - this.shown) * 0.5;
        break;
      }
      case 'failed': {
        // Drain the gold back out, then wait at the start dot again.
        const k = Math.min(1, (now - this.stateSince) / FAIL_FADE_MS);
        this.shown = this.failedFrom * (1 - k);
        if (k >= 1 && now - this.stateSince > 1200) {
          this.index = 0;
          this.setState('waiting', now);
        }
        break;
      }
      case 'success':
        this.shown = 1;
        if (now - this.stateSince > SUCCESS_HOLD_MS) {
          const done = this.onDone;
          this.stop();
          done();
          return;
        }
        break;
    }

    const pct = Math.round(this.shown * 100);
    this.meterFill.style.width = `${pct}%`;
    this.meterLabel.textContent = `Match ${pct}%`;
    this.draw(now, time);
  }

  /**
   * Moves progress forward to the nearest guide point just ahead of the wand.
   * Only a short stretch ahead is searched, so the path must be followed in order
   * (cutting across a loop doesn't count). Returns whether the wand is in the corridor.
   */
  private follow(p: Point2): boolean {
    const g = this.guide;
    const d = this.dist;
    const ahead = d[this.index] + this.tol * LOOKAHEAD;
    const behind = d[this.index] - this.tol;
    let best = -1;
    let bestD = Infinity;
    let inCorridor = false;
    // Look back a little too, so wobbling just behind the progress still counts as on the path.
    let i = this.index;
    while (i > 0 && d[i - 1] >= behind) i--;
    for (; i < g.length && d[i] <= ahead; i++) {
      const dd = Math.hypot(p.x - g[i].x, p.y - g[i].y);
      if (dd <= this.tol) inCorridor = true;
      if (i >= this.index && dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    if (best > this.index && bestD <= this.tol) this.index = best;
    return inCorridor;
  }

  private setState(state: State, now: number) {
    this.state = state;
    this.stateSince = now;
    const text: Record<State, string> = {
      waiting: 'Touch the glowing dot to begin',
      tracing: 'Follow the line…',
      failed: 'Try again',
      success: 'Success!',
    };
    if (text[state] !== this.lastStatus) {
      this.statusEl.textContent = this.lastStatus = text[state];
      this.statusEl.dataset.state = state;
    }
  }

  /** Places the spell's path large in the middle of the screen (or of the portrait frame). */
  layout() {
    if (!this.spell) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const region = this.getRegion();
    let size = Math.min(H * GUIDE_SIZE, W * 0.85);
    let cx = W / 2;
    let cy = H * 0.56; // a little low, leaving room for the card at the top
    if (region) {
      // In the Hall, the symbol sits in the middle of the frame, over you.
      size = Math.min(size, region.h * 0.9, region.w * 0.9);
      cx = region.x + region.w / 2;
      cy = region.y + region.h / 2;
    }
    const curve = smoothPath(this.spell.path, 16).map((q) => ({ x: cx + (q.x - 0.5) * size, y: cy + (q.y - 0.5) * size }));
    const count = Math.max(2, Math.ceil(pathLength(curve) / GUIDE_SPACING));
    this.guide = resample(curve, count);
    this.dist = [0];
    for (let i = 1; i < this.guide.length; i++) {
      this.dist.push(this.dist[i - 1] + Math.hypot(this.guide[i].x - this.guide[i - 1].x, this.guide[i].y - this.guide[i - 1].y));
    }
    this.tol = Math.max(36, W * CORRIDOR);
    this.index = Math.min(this.index, this.guide.length - 1);
  }

  private endDirection(): Point2 {
    const g = this.guide;
    const a = g[Math.max(0, g.length - 1 - Math.ceil(this.tol / GUIDE_SPACING))];
    const b = g[g.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  }

  // ---------- Drawing ----------

  private draw(now: number, time: number) {
    const ctx = this.ctx;
    const g = this.guide;
    const W = window.innerWidth;
    const H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    if (g.length < 2) return;

    // After a success the whole symbol glows gold, then fades away.
    const successAge = this.state === 'success' ? (now - this.stateSince) / SUCCESS_HOLD_MS : 0;
    ctx.globalAlpha = this.state === 'success' ? Math.max(0, 1 - Math.max(0, successAge - 0.4) / 0.6) : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // The corridor: a very faint band showing how close you need to stay.
    this.stroke(g.length, 'rgba(255, 255, 255, 0.035)', this.tol * 2, 0, '');

    // The guide line: a soft glowing white line.
    this.stroke(g.length, 'rgba(255, 255, 255, 0.35)', 10, 22, 'rgba(255, 255, 255, 0.9)');
    this.stroke(g.length, 'rgba(255, 255, 255, 0.85)', 3, 8, 'rgba(255, 255, 255, 0.9)');

    // The traced part, filled in glowing gold.
    const upto = this.pointsFor(this.shown);
    if (upto > 1) {
      this.stroke(upto, 'rgba(255, 196, 61, 0.9)', 12, 26, 'rgba(255, 190, 50, 1)');
      this.stroke(upto, 'rgba(255, 246, 214, 1)', 4, 10, 'rgba(255, 220, 120, 1)');
    }

    const gold = this.state === 'success';
    this.arrow(gold);

    // The start dot pulses; while waiting, a ring ripples out from it to invite a touch.
    const s = g[0];
    const pulse = 1 + 0.22 * Math.sin(time * 5);
    if (this.state === 'waiting') {
      const k = (time * 0.9) % 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 12 + k * this.tol, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.stroke();
    }
    this.dot(s, 11 * pulse, this.state === 'waiting' ? '#ffffff' : '#ffd66b');

    // A bright head at the current progress point.
    if (upto > 1 && this.state !== 'success') this.dot(g[upto - 1], 7, '#fff3c4');
    ctx.globalAlpha = 1;
  }

  /** How many guide points make up `fraction` of the path. */
  private pointsFor(fraction: number): number {
    if (fraction <= 0) return 0;
    const target = fraction * this.dist[this.dist.length - 1];
    let i = 0;
    while (i < this.dist.length - 1 && this.dist[i] < target) i++;
    return i + 1;
  }

  private stroke(count: number, color: string, width: number, blur: number, glow: string) {
    const ctx = this.ctx;
    const g = this.guide;
    ctx.beginPath();
    ctx.moveTo(g[0].x, g[0].y);
    for (let i = 1; i < count; i++) ctx.lineTo(g[i].x, g[i].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowBlur = blur;
    ctx.shadowColor = glow || 'transparent';
    ctx.stroke();
  }

  private dot(p: Point2, r: number, color: string) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowBlur = 24;
    ctx.shadowColor = color;
    ctx.fill();
  }

  private arrow(gold: boolean) {
    const ctx = this.ctx;
    const end = this.guide[this.guide.length - 1];
    const d = this.endDirection();
    const a = Math.atan2(d.y, d.x);
    const h = 26;
    const pt = (da: number, r: number) => [end.x + Math.cos(a + da) * r, end.y + Math.sin(a + da) * r] as const;
    ctx.beginPath();
    ctx.moveTo(...pt(0, h * 0.45));
    ctx.lineTo(...pt(2.55, h));
    ctx.lineTo(...pt(-2.55, h));
    ctx.closePath();
    ctx.fillStyle = gold ? '#ffd66b' : 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 18;
    ctx.shadowColor = gold ? '#ffbe32' : 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
  }
}
