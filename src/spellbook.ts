import type { Point2 } from './gestures';
import { smoothPath, toSvgPath } from './spellPath';
import type { Spell } from './spells.js';

/** How long the wand tip must hover over a card to choose it. */
export const DWELL_MS = 1500;

/**
 * An SVG drawing of a spell's wand motion: the path, a dot where it starts and an
 * arrowhead where it ends. With `animate`, a bright stroke traces the path over and over.
 */
export function spellSvg(spell: Spell, size: number, pad: number, animate = false): string {
  const d = toSvgPath(spell.path, size, pad);
  const pts = smoothPath(spell.path);
  const s = size - pad * 2;
  const at = (p: Point2) => ({ x: pad + p.x * s, y: pad + p.y * s });
  const start = at(pts[0]);
  const end = at(pts[pts.length - 1]);
  const before = at(pts[Math.max(0, pts.length - 4)]);
  const a = Math.atan2(end.y - before.y, end.x - before.x);
  const h = size * 0.07; // arrowhead size
  const tip = (da: number, r: number) => `${(end.x + Math.cos(a + da) * r).toFixed(1)},${(end.y + Math.sin(a + da) * r).toFixed(1)}`;
  const arrow = `${tip(0, h * 0.4)} ${tip(2.5, h)} ${tip(-2.5, h)}`;
  return `<svg class="spell-svg" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <path class="spell-line" d="${d}" />
    ${animate ? `<path class="spell-line spell-trace" d="${d}" pathLength="1" />` : ''}
    <circle class="spell-start" cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="${(size * 0.035).toFixed(1)}" />
    <polygon class="spell-arrow" points="${arrow}" />
  </svg>`;
}

/**
 * The spell menu: a grid of cards over the camera. Choose one by clicking it,
 * or by holding the wand tip over it for 1.5 s (a gold ring fills while you hover).
 */
export class Spellbook {
  isOpen = false;
  private cards: { el: HTMLButtonElement; ring: SVGCircleElement; spell: Spell }[] = [];
  private rects: DOMRect[] = [];
  private dwell: { index: number; start: number } | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly cursor: HTMLElement,
    spells: readonly Spell[],
    private readonly onChoose: (spell: Spell) => void,
  ) {
    const grid = root.querySelector<HTMLElement>('.spell-grid')!;
    for (const spell of spells) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'spell-card';
      el.innerHTML = `
        <div class="spell-art">
          <svg class="dwell-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" pathLength="1" /></svg>
          ${spellSvg(spell, 100, 14)}
        </div>
        <div class="spell-name">${spell.name}</div>
        <div class="spell-kind">${spell.kind}</div>
        <div class="spell-desc">${spell.description}</div>`;
      el.addEventListener('click', () => this.choose(spell));
      grid.appendChild(el);
      this.cards.push({ el, ring: el.querySelector('.dwell-ring circle')!, spell });
    }
    root.querySelector('.spellbook-close')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    window.addEventListener('resize', () => this.measure());
    root.querySelector('.spell-grid')!.addEventListener('scroll', () => this.measure());
  }

  open() {
    this.isOpen = true;
    this.root.hidden = false;
    this.measure();
    this.cards[0]?.el.focus({ preventScroll: true });
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
    this.cursor.hidden = true;
    this.resetDwell();
  }

  /** Call every frame while open, with the wand tip in screen pixels (or null when lost). */
  updateWand(p: Point2 | null, now: number) {
    if (!this.isOpen) return;
    this.cursor.hidden = !p;
    if (!p) {
      this.resetDwell();
      return;
    }
    this.cursor.style.transform = `translate(${p.x}px, ${p.y}px)`;

    const index = this.rects.findIndex((r) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom);
    if (index < 0) {
      this.resetDwell();
      return;
    }
    if (!this.dwell || this.dwell.index !== index) {
      this.resetDwell();
      this.dwell = { index, start: now };
      this.cards[index].el.classList.add('hovered');
    }
    const progress = Math.min(1, (now - this.dwell.start) / DWELL_MS);
    this.cards[index].ring.style.strokeDashoffset = String(1 - progress);
    if (progress >= 1) this.choose(this.cards[index].spell);
  }

  private choose(spell: Spell) {
    this.close();
    this.onChoose(spell);
  }

  private resetDwell() {
    if (this.dwell) {
      const c = this.cards[this.dwell.index];
      c.el.classList.remove('hovered');
      c.ring.style.strokeDashoffset = '1';
    }
    this.dwell = null;
  }

  private measure() {
    if (this.isOpen) this.rects = this.cards.map((c) => c.el.getBoundingClientRect());
  }
}
