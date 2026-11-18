/**
 * Spell path geometry: turning the config points into smooth curves, and
 * comparing a drawn wand stroke against a spell's shape.
 */

export interface Pt {
  x: number;
  y: number;
}
export type PathPoint = [number, number] | [number, number, 'corner'];

/**
 * Smooths config points into a dense curve with Catmull-Rom splines.
 * Points marked 'corner' stay sharp (the curve is split there).
 */
export function smoothPath(points: readonly PathPoint[], perSegment = 12): Pt[] {
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  points.forEach((p, i) => {
    run.push({ x: p[0], y: p[1] });
    if (p[2] === 'corner' && i > 0 && i < points.length - 1) {
      runs.push(run);
      run = [{ x: p[0], y: p[1] }];
    }
  });
  runs.push(run);

  const out: Pt[] = [];
  for (const r of runs) {
    const seg = catmullRom(r, perSegment);
    if (out.length) seg.shift(); // the corner point is already there
    out.push(...seg);
  }
  return out;
}

function catmullRom(p: Pt[], n: number): Pt[] {
  if (p.length < 2) return p.slice();
  const out: Pt[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p1 = p[i];
    const p2 = p[i + 1];
    // At the ends, mirror the neighbor so the curve leaves/arrives in a straight-ish line.
    const p0 = p[i - 1] ?? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 = p[i + 2] ?? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push({ ...p[p.length - 1] });
  return out;
}

export function pathLength(pts: readonly Pt[], from = 0, to = pts.length): number {
  let len = 0;
  for (let i = from + 1; i < to; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** Re-spaces a path into `n` evenly spaced points along its length. */
export function resample(pts: readonly Pt[], n: number, from = 0, to = pts.length): Pt[] {
  const total = pathLength(pts, from, to);
  if (to - from < 2 || total === 0) return Array.from({ length: n }, () => ({ ...pts[from] }));
  const step = total / (n - 1);
  const out: Pt[] = [{ ...pts[from] }];
  let acc = 0;
  let prev = pts[from];
  let i = from + 1;
  while (i < to && out.length < n) {
    const cur = pts[i];
    const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(q);
      prev = q;
      acc = 0;
    } else {
      acc += d;
      prev = cur;
      i++;
    }
  }
  while (out.length < n) out.push({ ...pts[to - 1] });
  return out;
}

/**
 * Centers a path on its bounding box and scales its longest side to 1.
 * Proportions are kept, so a tall line stays a tall line.
 */
export function normalize(pts: readonly Pt[]): Pt[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const s = Math.max(x1 - x0, y1 - y0) || 1;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return pts.map((p) => ({ x: (p.x - cx) / s, y: (p.y - cy) / s }));
}

export const SAMPLES = 40;

/** A spell's shape, prepared once for fast matching. */
export function makeTemplate(points: readonly PathPoint[]): Pt[] {
  return normalize(resample(smoothPath(points), SAMPLES));
}

/** Average distance between matching points of two prepared shapes (0 = identical). */
function distance(a: readonly Pt[], b: readonly Pt[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return d / a.length;
}

/** How far off a stroke can be and still count; a perfect copy scores 1, this distance scores 0. */
const ZERO_SCORE_DISTANCE = 0.3;

/**
 * How closely the stroke pts[from..to) matches a template, 0..1.
 * The direction matters (drawing a shape backwards doesn't count), but size and position don't.
 */
export function matchScore(template: readonly Pt[], pts: readonly Pt[], from = 0, to = pts.length): number {
  const raw = resample(pts, SAMPLES, from, to);
  let best = Infinity;
  // People draw shapes a little tilted and squashed, so try a few small tilts, and also
  // stretching the stroke to the template's proportions. The closest fit counts.
  for (const angle of TILTS) {
    const r = angle ? rotate(raw, angle) : raw;
    best = Math.min(best, distance(template, normalize(r)));
    const stretched = stretchTo(r, template);
    if (stretched) best = Math.min(best, distance(template, stretched) * STRETCH_PENALTY);
  }
  return Math.max(0, 1 - best / ZERO_SCORE_DISTANCE);
}

const TILTS = [0, -0.21, 0.21]; // radians, about ±12°
const STRETCH_PENALTY = 1.1; // a stretched fit counts as slightly worse than a natural one

function rotate(pts: readonly Pt[], a: number): Pt[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

/**
 * Scales width and height separately so the stroke's box has the template's proportions.
 * Skipped for thin shapes (lines), where stretching a wobble would blow it up.
 */
function stretchTo(pts: readonly Pt[], template: readonly Pt[]): Pt[] | null {
  const box = (ps: readonly Pt[]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of ps) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    return { x0, y0, w: x1 - x0, h: y1 - y0 };
  };
  const t = box(template);
  const b = box(pts);
  const tMax = Math.max(t.w, t.h);
  const bMax = Math.max(b.w, b.h);
  if (t.w < 0.25 * tMax || t.h < 0.25 * tMax || b.w < 0.25 * bMax || b.h < 0.25 * bMax) return null;
  return pts.map((p) => ({ x: t.x0 + ((p.x - b.x0) / b.w) * t.w, y: t.y0 + ((p.y - b.y0) / b.h) * t.h }));
}

/** An SVG path string for drawing a spell's shape in a box of the given size. */
export function toSvgPath(points: readonly PathPoint[], size: number, pad: number): string {
  const pts = smoothPath(points);
  const s = size - pad * 2;
  return pts.map((p, i) => `${i ? 'L' : 'M'}${(pad + p.x * s).toFixed(1)} ${(pad + p.y * s).toFixed(1)}`).join(' ');
}
