import type { ImageSegmenter } from '@mediapipe/tasks-vision';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MAGIC PORTRAIT CONFIG: fine-tune the Hall background here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const HALL = {
  /** Background picture (in /public). */
  image: `${import.meta.env.BASE_URL}assets/hall-bg.jpg`,
  /** The picture's size in pixels, used to place the frame opening on screen. */
  imageWidth: 2000,
  imageHeight: 1125,
  /**
   * The inside of the gold frame, as fractions of the picture (0 = left/top, 1 = right/bottom).
   * You are drawn only inside this box, so the frame stays in front of you.
   * Measured from the gold frame's inner edge in hall-bg.jpg.
   */
  opening: { left: 0.207, top: 0.203, right: 0.794, bottom: 0.8 },
  /** Softness of your cut-out edge, in mask pixels (the mask is ~320 px wide). */
  feather: 2.5,
  /** Below this person-confidence a pixel is fully see-through, above `solid` fully opaque. */
  cutoff: 0.25,
  solid: 0.75,
  /** Warm candlelight look for your video (a CSS filter) plus a soft orange glow on top. */
  videoFilter: 'sepia(0.28) saturate(1.15) contrast(1.05) brightness(0.96)',
  glow: 'rgba(255, 150, 60, 0.16)',
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the frame opening is on screen, with the picture covering the screen (like CSS `cover`). */
export function hallOpening(W: number, H: number): Rect {
  const scale = Math.max(W / HALL.imageWidth, H / HALL.imageHeight);
  const iw = HALL.imageWidth * scale;
  const ih = HALL.imageHeight * scale;
  const ox = (W - iw) / 2;
  const oy = (H - ih) / 2;
  const o = HALL.opening;
  return { x: ox + o.left * iw, y: oy + o.top * ih, w: (o.right - o.left) * iw, h: (o.bottom - o.top) * ih };
}

const MASK_WIDTH = 320; // the camera frame is shrunk to this width before segmentation

/**
 * "Magic Portrait": cuts you out of your room with MediaPipe selfie segmentation and draws
 * you inside the gold frame of the Hall picture, with a warm candlelight tint.
 */
export class Portrait {
  private segmenter: ImageSegmenter | null = null;
  private personIndex = 0;
  private readonly ctx: CanvasRenderingContext2D;
  // Small working canvases: the shrunk camera frame and the person mask.
  private readonly small = document.createElement('canvas');
  private readonly smallCtx = this.small.getContext('2d', { willReadFrequently: true })!;
  private readonly mask = document.createElement('canvas');
  private readonly maskCtx = this.mask.getContext('2d')!;
  private readonly soft = document.createElement('canvas');
  private readonly softCtx = this.soft.getContext('2d')!;
  private maskData: ImageData | null = null;
  private hasMask = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  setSegmenter(seg: ImageSegmenter) {
    this.segmenter = seg;
    // The selfie model has one label ("selfie"). If a model lists "background" first, use the next one.
    const labels = seg.getLabels().map((l) => l.toLowerCase());
    this.personIndex = labels.length > 1 && labels[0].includes('background') ? 1 : 0;
  }

  get ready() {
    return this.segmenter !== null;
  }

  /** Call when the screen size changes. */
  resize(W: number, H: number, dpr: number) {
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Segments a new camera frame and redraws you inside `rect` (screen pixels). */
  render(video: HTMLVideoElement, now: number, rect: Rect) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    if (this.segmenter) this.updateMask(video, now, vw, vh);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.hasMask) return;

    // Same placement as the overlays use: the camera image covers the opening, mirrored.
    const scale = Math.max(rect.w / vw, rect.h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = rect.x - (dw - rect.w) / 2;
    const dy = rect.y - (dh - rect.h) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip(); // only inside the frame opening

    // 1. Your video, mirrored, with the candlelight filter.
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.filter = HALL.videoFilter;
    ctx.drawImage(video, 0, 0, dw, dh);
    ctx.restore();

    // 2. Keep only you: multiply by the softened person mask.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(this.soft, 0, 0, dw, dh);
    ctx.restore();

    // 3. A warm glow, as if lit by the hall's candles (only on you).
    ctx.globalCompositeOperation = 'source-atop';
    const glow = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    glow.addColorStop(0, HALL.glow);
    glow.addColorStop(1, 'rgba(120, 50, 10, 0.12)');
    ctx.fillStyle = glow;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private updateMask(video: HTMLVideoElement, now: number, vw: number, vh: number) {
    const w = MASK_WIDTH;
    const h = Math.round((MASK_WIDTH * vh) / vw);
    for (const c of [this.small, this.mask, this.soft]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
    if (!this.maskData || this.maskData.width !== w || this.maskData.height !== h) this.maskData = this.maskCtx.createImageData(w, h);
    this.smallCtx.drawImage(video, 0, 0, w, h);

    this.segmenter!.segmentForVideo(this.small, now, (result) => {
      const m = result.confidenceMasks?.[this.personIndex];
      if (!m) return;
      const conf = m.getAsFloat32Array();
      const out = this.maskData!.data;
      const lo = HALL.cutoff;
      const span = Math.max(0.01, HALL.solid - HALL.cutoff);
      for (let i = 0; i < conf.length; i++) {
        const a = Math.min(1, Math.max(0, (conf[i] - lo) / span));
        out[i * 4 + 3] = a * 255; // only alpha matters for the mask
      }
      this.maskCtx.putImageData(this.maskData!, 0, 0);
      this.hasMask = true;
    });

    // Feather the edge: a small blur, then it's stretched up to screen size (which smooths it more).
    this.softCtx.clearRect(0, 0, w, h);
    this.softCtx.filter = `blur(${HALL.feather}px)`;
    this.softCtx.drawImage(this.mask, 0, 0);
    this.softCtx.filter = 'none';
  }
}
