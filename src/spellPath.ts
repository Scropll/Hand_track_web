/**
 * Spell path geometry: turning the config points into smooth curves.
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

/** An SVG path string for drawing a spell's shape in a box of the given size. */
export function toSvgPath(points: readonly PathPoint[], size: number, pad: number): string {
  const pts = smoothPath(points);
  const s = size - pad * 2;
  return pts.map((p, i) => `${i ? 'L' : 'M'}${(pad + p.x * s).toFixed(1)} ${(pad + p.y * s).toFixed(1)}`).join(' ');
}
