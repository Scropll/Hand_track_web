import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Point2 } from './gestures';

/**
 * Wand tip tracking.
 *
 * 1. Color: each camera frame is shrunk to a small image and every pixel is tested against an HSV
 *    color range (default: neon green tape). The densest patch of matching pixels is the tip.
 * 2. Fallback: if the color isn't visible, the tip is estimated from the hand: a line from the
 *    wrist through the index knuckle, about 1.5× the hand's length long.
 * 3. The result is smoothed with a lerp so it doesn't jitter.
 *
 * Positions are in camera-image coordinates (0..1, not mirrored), like MediaPipe's landmarks.
 */

/** An HSV color range. Hue in degrees (0..360), saturation and value 0..1. */
export interface ColorProfile {
  h: number;
  hTol: number;
  sMin: number;
  vMin: number;
}

export type WandSource = 'color' | 'hand' | 'none';

// Neon green tape: hue ~110°, strongly saturated and bright. Calibration replaces this.
export const DEFAULT_PROFILE: ColorProfile = { h: 110, hTol: 35, sMin: 0.45, vMin: 0.4 };

const STORAGE_KEY = 'wand-color-profile';
const PROC_WIDTH = 240; // the camera frame is shrunk to this width before color search
const CELL = 6; // pixels per cell in the coarse search grid
const MIN_PIXELS = 4; // fewer matching pixels than this counts as "not found"
const MAX_PIXELS_FRACTION = 0.08; // a huge blob is a shirt or a wall, not tape
const WAND_LENGTH = 1.5; // fallback: tip distance from the wrist, in hand lengths
const PALM_TO_HAND = 1.8; // hand length ≈ 1.8 × wrist→middle-knuckle (works even when the fist is closed)
const LOST_AFTER_MS = 250; // how long the tip may be missing before the wand counts as lost

export class WandTracker {
  profile: ColorProfile = loadProfile();

  /** Smoothed tip position (camera coords), or null when lost. */
  pos: Point2 | null = null;
  source: WandSource = 'none';

  private target: Point2 | null = null;
  private targetSource: WandSource = 'none';
  private lastFound = -Infinity;

  private readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private grid = new Uint16Array(0);

  /** Call once per new camera frame. `hands` are MediaPipe hand landmarks (may be empty). */
  detect(video: HTMLVideoElement, hands: NormalizedLandmark[][], now: number) {
    const found = this.findColor(video);
    if (found) {
      this.setTarget(found, 'color', now);
      return;
    }
    const est = this.estimateFromHands(video, hands);
    if (est) this.setTarget(est, 'hand', now);
  }

  /** Call every rendered frame: eases the shown position toward the latest target. */
  update(dt: number, now: number) {
    if (!this.target || now - this.lastFound > LOST_AFTER_MS) {
      this.pos = null;
      this.target = null;
      this.source = 'none';
      return;
    }
    this.source = this.targetSource;
    if (!this.pos) {
      this.pos = { ...this.target }; // just (re)found: jump straight there
      return;
    }
    // Frame-rate independent lerp. Big moves catch up faster so the wand doesn't feel laggy,
    // small ones are damped more, which removes the jitter.
    const dist = Math.hypot(this.target.x - this.pos.x, this.target.y - this.pos.y);
    const rate = 12 + 40 * Math.min(1, dist / 0.08);
    const t = 1 - Math.exp(-rate * dt);
    this.pos.x += (this.target.x - this.pos.x) * t;
    this.pos.y += (this.target.y - this.pos.y) * t;
  }

  private setTarget(p: Point2, source: WandSource, now: number) {
    this.target = p;
    this.targetSource = source;
    this.lastFound = now;
  }

  /** Shrinks the frame to a small image so the per-pixel color test stays cheap. */
  private grabFrame(video: HTMLVideoElement): ImageData | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const w = PROC_WIDTH;
    const h = Math.round((PROC_WIDTH * vh) / vw);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    return this.ctx.getImageData(0, 0, w, h);
  }

  private findColor(video: HTMLVideoElement): Point2 | null {
    const img = this.grabFrame(video);
    if (!img) return null;
    const { width: w, height: h, data } = img;
    const gw = Math.ceil(w / CELL);
    const gh = Math.ceil(h / CELL);
    if (this.grid.length !== gw * gh) this.grid = new Uint16Array(gw * gh);
    const grid = this.grid;
    grid.fill(0);

    // Pass 1: count matching pixels in each grid cell.
    const { h: ph, hTol, sMin, vMin } = this.profile;
    let total = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (matches(data[i], data[i + 1], data[i + 2], ph, hTol, sMin, vMin)) {
          grid[((y / CELL) | 0) * gw + ((x / CELL) | 0)]++;
          total++;
        }
      }
    }
    if (total < MIN_PIXELS || total > w * h * MAX_PIXELS_FRACTION) return null;

    // Pick the cell with the most matches around it (3×3 neighborhood): the densest blob wins,
    // so a few stray green pixels elsewhere don't pull the tip around.
    let best = -1;
    let bestScore = 0;
    for (let cy = 0; cy < gh; cy++) {
      for (let cx = 0; cx < gw; cx++) {
        if (!grid[cy * gw + cx]) continue;
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = cy + dy;
          if (yy < 0 || yy >= gh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = cx + dx;
            if (xx >= 0 && xx < gw) s += grid[yy * gw + xx];
          }
        }
        if (s > bestScore) {
          bestScore = s;
          best = cy * gw + cx;
        }
      }
    }
    if (bestScore < MIN_PIXELS) return null;

    // Pass 2: the tip is the center of the matching pixels in that neighborhood.
    const cx = best % gw;
    const cy = (best / gw) | 0;
    const x0 = Math.max(0, (cx - 1) * CELL);
    const x1 = Math.min(w, (cx + 2) * CELL);
    const y0 = Math.max(0, (cy - 1) * CELL);
    const y1 = Math.min(h, (cy + 2) * CELL);
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        if (matches(data[i], data[i + 1], data[i + 2], ph, hTol, sMin, vMin)) {
          sx += x;
          sy += y;
          n++;
        }
      }
    }
    return n ? { x: (sx / n + 0.5) / w, y: (sy / n + 0.5) / h } : null;
  }

  /** Fallback: extend wrist → index knuckle to where the wand tip should be. */
  private estimateFromHands(video: HTMLVideoElement, hands: NormalizedLandmark[][]): Point2 | null {
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    let best: Point2 | null = null;
    let bestDist = Infinity;
    for (const lm of hands) {
      // Work in pixels so the direction isn't skewed by the frame's aspect ratio.
      const wrist = { x: lm[0].x * vw, y: lm[0].y * vh };
      const knuckle = { x: lm[5].x * vw, y: lm[5].y * vh };
      const middle = { x: lm[9].x * vw, y: lm[9].y * vh };
      const dx = knuckle.x - wrist.x;
      const dy = knuckle.y - wrist.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const handLen = Math.hypot(middle.x - wrist.x, middle.y - wrist.y) * PALM_TO_HAND;
      const reach = WAND_LENGTH * handLen;
      const tip = { x: (wrist.x + (dx / len) * reach) / vw, y: (wrist.y + (dy / len) * reach) / vh };
      // With two hands, stay with the one the wand was already in.
      const ref = this.pos ?? this.target;
      const d = ref ? Math.hypot(tip.x - ref.x, tip.y - ref.y) : 0;
      if (d < bestDist) {
        bestDist = d;
        best = tip;
      }
    }
    return best;
  }

  /**
   * Samples the color around a point on the camera image (0..1 coords) and makes it the new
   * tracked color. Returns an error message if the spot doesn't have a clear color.
   */
  calibrate(video: HTMLVideoElement, nx: number, ny: number): string | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return 'The camera isn’t ready yet.';
    // Sample a small patch at full camera resolution, scaled to the frame size.
    const r = Math.max(3, Math.round(Math.min(vw, vh) * 0.008));
    const size = r * 2 + 1;
    const px = Math.round(nx * vw);
    const py = Math.round(ny * vh);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(video, px - r, py - r, size, size, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    const hues: number[] = [];
    const sats: number[] = [];
    const vals: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      if (s < 0.3 || v < 0.15) continue; // grey/dull, white glare or shadow: no usable hue
      hues.push(h);
      sats.push(s);
      vals.push(v);
    }
    if (hues.length < size * size * 0.2) {
      return 'No clear color there. Click right on the colored tape.';
    }

    // Hue is an angle, so average it as a direction (red at 359° and 1° average to 0°, not 180°).
    let cs = 0;
    let sn = 0;
    for (const h of hues) {
      cs += Math.cos((h * Math.PI) / 180);
      sn += Math.sin((h * Math.PI) / 180);
    }
    const meanH = ((Math.atan2(sn, cs) * 180) / Math.PI + 360) % 360;
    let spread = 0;
    for (const h of hues) spread = Math.max(spread, hueDist(h, meanH));

    sats.sort((a, b) => a - b);
    vals.sort((a, b) => a - b);
    const p10 = (a: number[]) => a[Math.floor(a.length * 0.1)];
    this.profile = {
      h: meanH,
      hTol: Math.min(40, Math.max(14, spread + 8)),
      sMin: Math.max(0.25, p10(sats) - 0.2),
      vMin: Math.max(0.15, p10(vals) - 0.3),
    };
    saveProfile(this.profile);
    return null;
  }
}

function matches(r: number, g: number, b: number, h0: number, hTol: number, sMin: number, vMin: number): boolean {
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  if (max < vMin * 255) return false;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  const d = max - min;
  if (d < sMin * max || d === 0) return false;
  let h: number;
  if (max === r) h = ((g - b) / d) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  if (h < 0) h += 360;
  return hueDist(h, h0) <= hTol;
}

const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max / 255];
}

/** CSS color for showing the tracked color in the UI. */
export const profileColor = (p: ColorProfile) => `hsl(${Math.round(p.h)} 100% 50%)`;

function loadProfile(): ColorProfile {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (p && [p.h, p.hTol, p.sMin, p.vMin].every((v) => typeof v === 'number' && isFinite(v))) return p;
  } catch {
    /* storage blocked or bad data: use the default */
  }
  return { ...DEFAULT_PROFILE };
}

function saveProfile(p: ColorProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: calibration still works for this visit */
  }
}
