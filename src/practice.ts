import type { Point2 } from './gestures';
import { spellSvg } from './spellbook';
import { makeTemplate, matchScore, pathLength, type Pt } from './spellPath';
import type { Spell } from './spells.js';

/** A stroke scoring at least this (0..1) casts the spell. */
export const CAST_THRESHOLD = 0.72;
/** Straight-line spells (Lumos, Nox) are easy to match by accident, so they need more. */
const LINE_THRESHOLD = 0.9;
const MAX_STROKE_MS = 4000; // only the last few seconds of wand movement are considered
const MIN_STROKE_MS = 250;
const MIN_SIZE = 0.15; // the shape must be at least this big (fraction of the screen's short side)
const LINE_MIN_SIZE = 0.25;
const CHECK_EVERY_MS = 90;
const COOLDOWN_MS = 1200; // pause after a cast so one motion doesn't cast twice
const LOST_BREAK_MS = 250; // if the wand is lost this long, the stroke starts over

export interface CastInfo {
  score: number;
  dir: Point2; // direction at the end of the stroke, screen pixels (y down), unit length
}

/**
 * Practice mode: shows one spell's motion and watches the wand.
 * When the recent wand movement matches the spell's shape, it casts.
 */
export class Practice {
  spell: Spell | null = null;
  private template: Pt[] = [];
  private isLine = false;
  private history: { x: number; y: number; t: number }[] = [];
  private lastSeen = -Infinity;
  private lastFeed = 0;
  private lastCheck = 0;
  private cooldownUntil = 0;
  private shownScore = 0;
  private casts = 0;

  private readonly nameEl: HTMLElement;
  private readonly kindEl: HTMLElement;
  private readonly descEl: HTMLElement;
  private readonly artEl: HTMLElement;
  private readonly meterFill: HTMLElement;
  private readonly meterLabel: HTMLElement;
  private readonly countEl: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly onCast: (spell: Spell, info: CastInfo) => void,
  ) {
    const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    this.nameEl = q('.practice-name');
    this.kindEl = q('.practice-kind');
    this.descEl = q('.practice-desc');
    this.artEl = q('.practice-art');
    this.meterFill = q('.meter-fill');
    this.meterLabel = q('.meter-label');
    this.countEl = q('.practice-count');
  }

  start(spell: Spell) {
    this.spell = spell;
    this.template = makeTemplate(spell.path);
    const xs = spell.path.map((p) => p[0]);
    const ys = spell.path.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    this.isLine = Math.min(w, h) < 0.25 * Math.max(w, h);
    this.history = [];
    this.casts = 0;
    this.shownScore = 0;
    this.nameEl.textContent = spell.name;
    this.kindEl.textContent = spell.kind;
    this.descEl.textContent = spell.description;
    this.artEl.innerHTML = spellSvg(spell, 140, 16, true);
    this.countEl.textContent = 'Trace the shape with your wand, starting at the dot.';
    this.root.hidden = false;
    this.renderMeter(0);
  }

  stop() {
    this.spell = null;
    this.history = [];
    this.root.hidden = true;
  }

  /** Call every frame with the wand tip in screen pixels (null when lost). */
  feed(p: Point2 | null, now: number) {
    if (!this.spell) return;
    if (p) {
      if (now - this.lastSeen > LOST_BREAK_MS) this.history = [];
      this.history.push({ x: p.x, y: p.y, t: now });
      this.lastSeen = now;
    }
    while (this.history.length && now - this.history[0].t > MAX_STROKE_MS) this.history.shift();

    // Let the meter sink slowly so it's readable.
    const dt = Math.min(0.1, (now - (this.lastFeed || now)) / 1000);
    this.lastFeed = now;
    this.shownScore = Math.max(0, this.shownScore - 0.6 * dt);
    if (now - this.lastCheck >= CHECK_EVERY_MS && now >= this.cooldownUntil) {
      this.lastCheck = now;
      const best = this.bestMatch(now);
      if (best && best.score > this.shownScore) this.shownScore = best.score;
      const threshold = this.isLine ? LINE_THRESHOLD : CAST_THRESHOLD;
      if (best && best.score >= threshold) {
        this.casts++;
        this.countEl.textContent = `Cast ${this.casts} time${this.casts === 1 ? '' : 's'}. Again!`;
        this.history = [];
        this.cooldownUntil = now + COOLDOWN_MS;
        this.onCast(this.spell, { score: best.score, dir: best.dir });
      }
    }
    this.renderMeter(this.shownScore);
  }

  /**
   * Tries every possible start point in the recent wand history (the end is always "now"),
   * so it doesn't matter what the wand did before the spell began.
   */
  private bestMatch(now: number): CastInfo | null {
    const h = this.history;
    const n = h.length;
    if (n < 6) return null;
    const minSize = (this.isLine ? LINE_MIN_SIZE : MIN_SIZE) * Math.min(window.innerWidth, window.innerHeight);
    let best: CastInfo | null = null;
    for (let i = 0; i < n - 5; i += 2) {
      if (now - h[i].t < MIN_STROKE_MS) break;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = i; k < n; k++) {
        x0 = Math.min(x0, h[k].x);
        y0 = Math.min(y0, h[k].y);
        x1 = Math.max(x1, h[k].x);
        y1 = Math.max(y1, h[k].y);
      }
      if (Math.max(x1 - x0, y1 - y0) < minSize) continue;
      if (pathLength(h, i, n) < minSize) continue;
      const score = matchScore(this.template, h, i, n);
      if (!best || score > best.score) best = { score, dir: endDirection(h, i, n) };
    }
    return best;
  }

  private renderMeter(score: number) {
    const pct = Math.round(score * 100);
    this.meterFill.style.width = `${pct}%`;
    this.meterLabel.textContent = `Match ${pct}%`;
  }
}

/** Direction of the last stretch of a stroke (about its final 15%). */
function endDirection(h: readonly Pt[], from: number, to: number): Point2 {
  const total = pathLength(h, from, to);
  let acc = 0;
  let k = to - 1;
  while (k > from && acc < total * 0.15) {
    acc += Math.hypot(h[k].x - h[k - 1].x, h[k].y - h[k - 1].y);
    k--;
  }
  const dx = h[to - 1].x - h[k].x;
  const dy = h[to - 1].y - h[k].y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}
