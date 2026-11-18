/**
 * Gesture recognition from MediaPipe's 21 hand landmarks.
 *
 * Landmark numbers: 0 = wrist, 4 = thumb tip, 8 = index tip, 12 = middle tip,
 * 16 = ring tip, 20 = pinky tip. The joint two below each tip (6, 10, 14, 18)
 * is the "PIP" knuckle.
 */
export type Gesture = 'open' | 'fist' | 'point' | 'peace' | 'pinch' | 'relaxed';

export interface Point2 { x: number; y: number }

export const GESTURE_LABELS: Record<Gesture, string> = {
  open: '🖐️ Open hand',
  fist: '✊ Fist',
  point: '☝️ Pointing',
  peace: '✌️ Peace',
  pinch: '🤏 Pinch',
  relaxed: '✋ Hand',
};

/** `pts` should be in pixel space, so x and y use the same units. */
export function classifyGesture(pts: Point2[]): Gesture {
  const dist = (a: number, b: number) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
  const handSize = dist(0, 9) || 1e-6; // wrist to middle-finger knuckle

  // A finger counts as straight when its tip is clearly farther from the wrist than its middle knuckle.
  const extended = (tip: number, pip: number) => dist(0, tip) > dist(0, pip) * 1.15;
  const index = extended(8, 6);
  const middle = extended(12, 10);
  const ring = extended(16, 14);
  const pinky = extended(20, 18);

  // Pinch: thumb and index tips touching, with the index tip away from the palm (so a fist doesn't count).
  const pinchGap = dist(4, 8) / handSize;
  if (pinchGap < 0.3 && dist(0, 8) > handSize * 1.0) return 'pinch';

  const count = +index + +middle + +ring + +pinky;
  if (count === 0) return 'fist';
  if (index && !middle && !ring && !pinky) return 'point';
  if (index && middle && !ring && !pinky) return 'peace';
  if (count >= 4) return 'open';
  return 'relaxed';
}

/**
 * Only switches to a new gesture after it has been seen for a few frames
 * in a row, so the effect doesn't flicker as your hand moves.
 */
export class GestureStabilizer {
  current: Gesture = 'relaxed';
  private candidate: Gesture = 'relaxed';
  private streak = 0;

  constructor(private readonly framesNeeded = 3) {}

  /** Returns true if the stable gesture changed on this frame. */
  push(g: Gesture): boolean {
    if (g === this.current) {
      this.streak = 0;
      return false;
    }
    if (g === this.candidate) this.streak++;
    else {
      this.candidate = g;
      this.streak = 1;
    }
    if (this.streak >= this.framesNeeded) {
      this.current = g;
      this.streak = 0;
      return true;
    }
    return false;
  }
}
