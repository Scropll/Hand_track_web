import * as THREE from 'three';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Point2 } from './gestures';

type ToWorld = (nx: number, ny: number) => Point2;

const BASE = import.meta.env.BASE_URL;
const HAT_URL = `${BASE}costume/harry_potter_hat.webp`;

// ---- Fitting (measured from the hat image, 1200 × 1081 px) ----
// The visible hat runs from x = 16 to x = 1185 and its lowest point is at y = 1071.
const IMG_W = 1200;
const IMG_H = 1081;
const VISIBLE = { left: 16, right: 1185, bottom: 1071 };
/** The point of the image pinned to your head: the middle of the hat's bottom edge. */
const ANCHOR = { x: (VISIBLE.left + VISIBLE.right) / 2 / IMG_W, y: VISIBLE.bottom / IMG_H };
/** Visible hat width = this × your face width (Face Landmarker points 234 ↔ 454). */
const WIDTH_PER_FACE = 1.3;
/** Gap between the top of your forehead (point 10) and the hat's bottom edge, as a fraction of face width. */
const GAP = 0.04;
/** Smoothing: 0 = frozen, 1 = no smoothing. Lower is steadier but lags more. */
const SMOOTH_POS = 0.35;
const SMOOTH_SIZE = 0.25;
const SMOOTH_ANGLE = 0.35;
/** How long to keep showing the hat after your face leaves the frame, in ms. */
const LOST_AFTER = 500;

interface Placement {
  x: number;
  y: number;
  width: number; // full image width, in scene units
  angle: number; // radians, 0 = upright
}

/** A wizard hat placed on your head using MediaPipe face tracking. */
export class Hat {
  readonly mesh: THREE.Mesh;
  enabled = true;
  private readonly material: THREE.MeshBasicMaterial;
  private state: Placement | null = null;
  private lastSeen = -Infinity;
  private opacity = 0;

  constructor() {
    const texture = new THREE.TextureLoader().load(HAT_URL);
    texture.colorSpace = THREE.SRGBColorSpace;

    // A 1 × (height/width) rectangle keeps the image's original proportions, so it never stretches.
    // It's shifted so the anchor point (middle of the hat's bottom edge) sits at the origin.
    const aspect = IMG_H / IMG_W;
    const geometry = new THREE.PlaneGeometry(1, aspect);
    geometry.translate(0.5 - ANCHOR.x, (ANCHOR.y - 0.5) * aspect, 0);

    this.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, opacity: 0 });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = 10; // behind the particles
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** New face tracking result. Face points used: 10 = top of forehead, 234 / 454 = left / right edge of the face. */
  place(lm: NormalizedLandmark[], now: number, toWorld: ToWorld) {
    const forehead = toWorld(lm[10].x, lm[10].y);
    const a = toWorld(lm[234].x, lm[234].y);
    const b = toWorld(lm[454].x, lm[454].y);

    // The line across your face, measured left-to-right on screen. It tilts when you tilt your head.
    let vx = b.x - a.x;
    let vy = b.y - a.y;
    if (vx < 0) {
      vx = -vx;
      vy = -vy;
    }
    const faceWidth = Math.hypot(vx, vy) || 1e-6;
    const up = { x: -vy / faceWidth, y: vx / faceWidth }; // "up" relative to your head

    const visibleWidth = faceWidth * WIDTH_PER_FACE;
    const target: Placement = {
      x: forehead.x + up.x * faceWidth * GAP,
      y: forehead.y + up.y * faceWidth * GAP,
      width: visibleWidth * (IMG_W / (VISIBLE.right - VISIBLE.left)), // the image has a little empty margin
      angle: Math.atan2(vy, vx),
    };

    const s = this.state;
    if (!s || now - this.lastSeen > LOST_AFTER) {
      this.state = target; // just appeared: jump straight there
    } else {
      s.x += (target.x - s.x) * SMOOTH_POS;
      s.y += (target.y - s.y) * SMOOTH_POS;
      s.width += (target.width - s.width) * SMOOTH_SIZE;
      s.angle += Math.atan2(Math.sin(target.angle - s.angle), Math.cos(target.angle - s.angle)) * SMOOTH_ANGLE;
    }
    this.lastSeen = now;
  }

  /** Called every frame: fades the hat in/out and applies the latest position. */
  update(dt: number, now: number) {
    const show = this.enabled && this.state !== null && now - this.lastSeen < LOST_AFTER;
    this.opacity = THREE.MathUtils.clamp(this.opacity + (show ? 1 : -1) * (dt / 0.2), 0, 1);
    this.material.opacity = this.opacity;
    this.mesh.visible = this.opacity > 0.01 && this.state !== null;
    if (!this.state) return;
    const { x, y, width, angle } = this.state;
    this.mesh.position.set(x, y, 0);
    this.mesh.rotation.z = angle;
    this.mesh.scale.set(width, width, 1); // same scale both ways = original aspect ratio
  }
}
