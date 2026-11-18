import type { Point2 } from './gestures';
import type { Force, ParticleField, RainZone } from './particles';
import type { Spell } from './spells.js';

/** Where the wand is when a spell runs. Scene coordinates: x -aspect..aspect, y -1..1 (up). */
export interface SpellContext {
  tip: Point2 | null; // wand tip in the scene, null if lost
  tipScreen: Point2 | null; // wand tip in screen pixels (for the Lumos light)
  aspect: number;
}

interface Timed {
  spell: Spell;
  start: number;
  end: number;
  origin: Point2; // wand tip when the spell was cast
  dir: Point2; // direction of the end of the stroke (unit vector, scene coordinates)
}

/** How long each effect lasts, in ms. Light and dark stay until cancelled. */
const DURATION: Record<string, number> = {
  unlock: 2500,
  tongueTie: 3000,
  reveal: 3000,
  silence: 3500,
  spiral: 4000,
  fall: 3500,
  rise: 3500,
  dance: 4000,
  gather: 3000,
  freeze: 3500,
  levitate: 4500,
  grow: 3500,
  push: 3000,
  clear: 1200,
  bolt: 1200,
  blast: 1800,
  attack: 2500,
  clearSky: 3000,
  revealWave: 2500,
};
const WEATHER = new Set(['fall', 'rise', 'levitate']); // what Meteolojinx Recanto stops

/**
 * Runs spell effects on the shared particle system, plus a few screen overlays
 * (Lumos light, Nox darkness, colored flashes).
 */
export class SpellEffects {
  private timed: Timed[] = [];
  private lumos: Spell | null = null;
  private nox: Spell | null = null;
  private colorOwner: Timed | null = null;

  constructor(
    private readonly particles: ParticleField,
    private readonly els: { light: HTMLElement; dark: HTMLElement; flash: HTMLElement },
    private readonly restorePalette: () => void,
  ) {}

  cast(spell: Spell, ctx: SpellContext, dir: Point2, now: number) {
    const o = ctx.tip ?? { x: 0, y: 0 };
    const p = this.particles;
    const t: Timed = { spell, start: now, end: now + (DURATION[spell.effect] ?? 3000), origin: { ...o }, dir };
    const angle = Math.atan2(dir.y, dir.x);

    switch (spell.effect) {
      case 'unlock': // a golden ring bursts open
        p.emit(o.x, o.y, 900, 1.5, 1.7);
        p.impulse(o.x, o.y, 0.8, 2);
        break;
      case 'reveal': // hidden sparkles appear all over
        p.sprinkle(2500);
        break;
      case 'blast': // red-orange explosion outward from the wand
        p.scatter(o.x, o.y, 2.2);
        p.emit(o.x, o.y, 1500, 1.0, 2.5);
        this.flash('rgba(255, 90, 20, 0.45)', 700);
        break;
      case 'bolt': // a red bolt shoots from the wand
        p.emitDirected(o.x, o.y, 600, angle, 0.04, 2.2, 2.5);
        this.flash('rgba(255, 20, 20, 0.35)', 450);
        break;
      case 'revealWave': // a bright ring sweeps outward
        p.emit(o.x, o.y, 1500, 1.4, 1.6);
        p.impulse(o.x, o.y, 1.2, 1.5);
        p.sprinkle(600);
        break;
      case 'clearSky': // weather spells end; everything lifts and clears
        this.timed = this.timed.filter((e) => !WEATHER.has(e.spell.effect));
        p.impulse(0, 0, 3, 1.5);
        this.flash('rgba(160, 215, 255, 0.25)', 800);
        break;
      case 'light':
        this.lumos = spell;
        this.nox = null;
        this.els.dark.classList.remove('on');
        p.emit(o.x, o.y, 300, 0.3, 0.8);
        break;
      case 'dark':
        this.nox = spell;
        this.lumos = null;
        this.els.light.classList.remove('on');
        this.els.dark.classList.add('on');
        break;
      case 'clear': // Finite Incantatem: end everything
        this.clear();
        p.impulse(0, 0, 3, 1.2);
        this.flash('rgba(255, 255, 255, 0.3)', 600);
        break;
    }

    if (spell.effect !== 'light' && spell.effect !== 'dark') this.timed.push(t);
    p.setColors(spell.colors);
    this.colorOwner = spell.effect === 'light' || spell.effect === 'dark' ? null : t;
  }

  /** Ends every effect and returns to the normal colors. */
  clear() {
    this.timed = [];
    this.lumos = this.nox = null;
    this.colorOwner = null;
    this.els.light.classList.remove('on');
    this.els.dark.classList.remove('on');
    this.restorePalette();
  }

  /** Adds this frame's spell forces to the particle simulation. */
  update(dt: number, now: number, ctx: SpellContext, forces: Force[], rain: RainZone[]) {
    const p = this.particles;
    const wide = ctx.aspect * 2 + 0.5; // a rain zone this wide covers the whole screen at full strength

    // Expire finished effects; when the one that set the colors ends, put the colors back.
    this.timed = this.timed.filter((e) => now < e.end);
    if (this.colorOwner && now >= this.colorOwner.end) {
      this.colorOwner = null;
      const keep = this.lumos ?? this.nox;
      if (keep) p.setColors(keep.colors);
      else this.restorePalette();
    }

    for (const e of this.timed) {
      const age = (now - e.start) / 1000;
      const life = (e.end - e.start) / 1000;
      const fade = Math.min(1, age / 0.3, (life - age) / 0.6); // ease in and out
      const o = e.origin;
      const tip = ctx.tip ?? o;
      const add = (x: number, y: number, radius: number, attract: number, swirl: number, drag = 0, vx = 0, vy = 0) =>
        forces.push({ x, y, radius, attract: attract * fade, swirl: swirl * fade, drag: drag * fade, vx, vy });

      switch (e.spell.effect) {
        case 'tongueTie': // particles knot tightly around the wand
          add(tip.x, tip.y, 1.0, 3, 7);
          break;
        case 'reveal':
          if (age < 1.5) p.sprinkle(Math.ceil(600 * dt));
          break;
        case 'silence': // everything slows and falls quiet
          add(0, 0, 6, 0, 0, 2.5);
          rain.push({ x: 0, halfWidth: wide, speed: 0.12, strength: 0.25 * fade });
          break;
        case 'spiral': // a big slow vortex over the whole screen
          add(0, 0, 3, 0.6, 3);
          break;
        case 'fall':
          rain.push({ x: 0, halfWidth: wide, speed: 1.8, strength: fade });
          break;
        case 'rise':
          rain.push({ x: 0, halfWidth: wide, speed: -1.8, strength: fade });
          break;
        case 'dance': // four whirls that circle the screen, spinning opposite ways
          for (let k = 0; k < 4; k++) {
            const a = age * 2.2 + (k * Math.PI) / 2;
            add(Math.cos(a) * 0.55 * ctx.aspect, Math.sin(a * 1.3) * 0.5, 0.65, 0.6, k % 2 ? 6 : -6);
          }
          break;
        case 'gather': // particles pull back together in the middle
          add(0, 0, 4, 3.5, 0.6, 0.3);
          break;
        case 'freeze': // motion stops dead
          add(0, 0, 6, 0, 0, 6);
          break;
        case 'levitate': // everything floats up gently around the wand
          rain.push({ x: 0, halfWidth: wide, speed: -0.35, strength: 0.6 * fade });
          add(tip.x, tip.y, 0.7, 0.4, 1.5);
          break;
        case 'grow': // green shoots rise from the bottom
          if (age < 2.5) p.sprout(Math.ceil(900 * dt), 0.6, 1.4);
          break;
        case 'push': // a strong current sweeps everything in the stroke's direction
          add(0, 0, 6, 0, 0, 2.2, e.dir.x * 1.8, e.dir.y * 1.8);
          break;
        case 'bolt': // the bolt keeps firing for a moment from the wand
          if (age < 0.5) p.emitDirected(tip.x, tip.y, Math.ceil(2500 * dt), Math.atan2(e.dir.y, e.dir.x), 0.04, 2.2, 2.5);
          break;
        case 'attack': // a stream of darts flies from the wand toward the target
          p.emitDirected(tip.x, tip.y, Math.ceil(900 * dt), Math.atan2(e.dir.y, e.dir.x), 0.25, 1.5, 2.4);
          add(tip.x + e.dir.x * 0.5, tip.y + e.dir.y * 0.5, 0.9, 0, 0, 1.5, e.dir.x * 2.2, e.dir.y * 2.2);
          break;
        case 'clearSky':
          rain.push({ x: 0, halfWidth: wide, speed: -0.6, strength: 0.5 * fade });
          break;
      }
    }

    // Lumos: a warm light follows the wand tip, with motes circling it.
    if (this.lumos && ctx.tip && ctx.tipScreen) {
      forces.push({ x: ctx.tip.x, y: ctx.tip.y, radius: 0.5, attract: 1.2, swirl: 2, drag: 0, vx: 0, vy: 0 });
      this.els.light.style.setProperty('--lx', `${ctx.tipScreen.x}px`);
      this.els.light.style.setProperty('--ly', `${ctx.tipScreen.y}px`);
    }
    this.els.light.classList.toggle('on', !!(this.lumos && ctx.tipScreen));
  }

  /** A brief full-screen flash of color. */
  flash(color: string, ms: number) {
    this.els.flash.style.background = color;
    this.els.flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }
}
