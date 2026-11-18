import * as THREE from 'three';
import type { FaceLandmarker, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { createFaceLandmarker, createHandLandmarker, startCamera } from './handTracking';
import { Hat } from './hat';
import { Vignette } from './vignette';
import { classifyGesture, GestureStabilizer, GESTURE_LABELS, type Gesture, type Point2 } from './gestures';
import { ParticleField, PALETTES, type Force, type RainZone } from './particles';
import { HandSkeleton } from './skeleton';
import { profileColor, WandTracker } from './wand';
import { WandTrail } from './wandTrail';

// ---------- Page elements ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('webcam');
const stage = $('stage');
const intro = $('intro');
const startBtn = $<HTMLButtonElement>('start');
const errorEl = $('error');
const hud = $('hud');
const statusEl = $('status');
const dimBtn = $<HTMLButtonElement>('toggle-dim');
const hatBtn = $<HTMLButtonElement>('toggle-hat');
const paletteBtn = $<HTMLButtonElement>('next-palette');
const wandBtn = $<HTMLButtonElement>('calibrate-wand');
const wandStatusEl = $('wand-status');
const legendItems = [...document.querySelectorAll<HTMLLIElement>('#legend li')];

// ---------- Three.js scene ----------
// A flat 2D view: x runs from -aspect to +aspect, y from -1 (bottom) to +1 (top).
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);

const PARTICLE_COUNT = window.innerWidth < 700 ? 7000 : 14000;
// Drawing order, back to front: camera video (behind the canvas) → hat → particles → hand outline.
const hat = new Hat();
scene.add(hat.mesh);
const vignette = new Vignette($('mood'));
let faceLandmarker: FaceLandmarker | null = null;

const particles = new ParticleField(PARTICLE_COUNT);
particles.points.renderOrder = 20;
scene.add(particles.points);

const skeletons = [new HandSkeleton(), new HandSkeleton()];
skeletons.forEach((s) => scene.add(s.group));

const wand = new WandTracker();
const wandTrail = new WandTrail();
scene.add(wandTrail.group);

let aspect = 1;
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  aspect = w / h;
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.left = -aspect;
  camera.right = aspect;
  camera.updateProjectionMatrix();
  particles.setBounds(aspect, 1);
  particles.setPointSize(3.2 * dpr * Math.max(0.7, h / 900));
  wandTrail.setPixelRatio(dpr);
}
window.addEventListener('resize', resize);
resize();

// ---------- Hand state ----------
interface HandState {
  world: Point2[]; // smoothed landmarks in scene coordinates
  palm: Point2;
  vel: Point2; // how fast the palm is moving (scene units per second)
  stabilizer: GestureStabilizer;
  blend: number; // 0→1 fade-in after a gesture changes, so effects ease in softly
  lastSeen: number;
  lastUpdate: number;
}
const hands = new Map<string, HandState>();
let landmarker: HandLandmarker | null = null;
let lastVideoTime = -1;
let paletteIndex = 0;
let lastPaletteSwitch = 0;

/**
 * Converts a MediaPipe point (0..1 across the camera image) to screen pixels.
 * Accounts for the video being cropped to fill the screen and mirrored.
 */
function toScreen(nx: number, ny: number): Point2 {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
  const dw = video.videoWidth * scale;
  const dh = video.videoHeight * scale;
  return { x: W - (nx * dw - (dw - W) / 2), y: ny * dh - (dh - H) / 2 }; // x is mirrored
}

/** The reverse of toScreen: screen pixels → camera image coordinates (0..1). */
function fromScreen(sx: number, sy: number): Point2 {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
  const dw = video.videoWidth * scale;
  const dh = video.videoHeight * scale;
  return { x: (W - sx + (dw - W) / 2) / dw, y: (sy + (dh - H) / 2) / dh };
}

/** Same as toScreen, but in the 3D scene's coordinates (x: -aspect..aspect, y: -1..1). */
function toWorld(nx: number, ny: number): Point2 {
  const p = toScreen(nx, ny);
  return { x: (p.x / window.innerWidth) * 2 * aspect - aspect, y: 1 - (p.y / window.innerHeight) * 2 };
}

const PALM_POINTS = [0, 5, 9, 13, 17];

function handleResult(result: HandLandmarkerResult, now: number) {
  const seenKeys = new Set<string>();
  result.landmarks.forEach((lm, i) => {
    // Track each hand by which hand it is ("Left"/"Right"), so it keeps its state between frames.
    let key = result.handedness[i]?.[0]?.categoryName ?? `hand${i}`;
    if (seenKeys.has(key)) key += i;
    seenKeys.add(key);

    const pixels = lm.map((p) => ({ x: p.x * video.videoWidth, y: p.y * video.videoHeight }));
    const target = lm.map((p) => toWorld(p.x, p.y));

    let hand = hands.get(key);
    if (!hand) {
      hand = { world: target, palm: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, stabilizer: new GestureStabilizer(), blend: 0, lastSeen: now, lastUpdate: now };
      hands.set(key, hand);
    } else {
      // Smoothing removes camera jitter and makes the motion feel gentler.
      hand.world.forEach((p, j) => {
        p.x += (target[j].x - p.x) * 0.4;
        p.y += (target[j].y - p.y) * 0.4;
      });
    }

    const palm = { x: 0, y: 0 };
    for (const j of PALM_POINTS) {
      palm.x += hand.world[j].x / PALM_POINTS.length;
      palm.y += hand.world[j].y / PALM_POINTS.length;
    }
    const dt = Math.max((now - hand.lastUpdate) / 1000, 1 / 120);
    if (hand.lastUpdate !== now) {
      hand.vel.x += ((palm.x - hand.palm.x) / dt - hand.vel.x) * 0.5;
      hand.vel.y += ((palm.y - hand.palm.y) / dt - hand.vel.y) * 0.5;
    }
    hand.palm = palm;
    hand.lastSeen = hand.lastUpdate = now;

    const changed = hand.stabilizer.push(classifyGesture(pixels));
    if (changed) {
      hand.blend = 0;
      onGestureStart(hand.stabilizer.current, hand);
    }
  });
}

/** One-off effects when a gesture begins. */
function onGestureStart(g: Gesture, hand: HandState) {
  if (g === 'fist') {
    particles.scatter(hand.palm.x, hand.palm.y, 1.3);
  } else if (g === 'pinch') {
    const p = pinchPoint(hand);
    particles.impulse(p.x, p.y, 0.7, 3.5);
    particles.emit(p.x, p.y, 500, 0.8, 4);
  } else if (g === 'peace') {
    const now = performance.now();
    if (now - lastPaletteSwitch > 800) {
      lastPaletteSwitch = now;
      nextPalette();
    }
  }
}

function nextPalette() {
  paletteIndex = (paletteIndex + 1) % PALETTES.length;
  particles.setPalette(paletteIndex);
  paletteBtn.textContent = `Colors: ${PALETTES[paletteIndex].name}`;
}

const pinchPoint = (h: HandState): Point2 => ({ x: (h.world[4].x + h.world[8].x) / 2, y: (h.world[4].y + h.world[8].y) / 2 });

const RAIN = { halfWidth: 0.45, speed: 1.4 };

/** Turns each hand's gesture into forces on the particles. Strengths are kept low for a soft, floaty feel. */
function buildForces(): { forces: Force[]; rain: RainZone[] } {
  const forces: Force[] = [];
  const rain: RainZone[] = [];
  for (const [key, h] of hands) {
    const b = h.blend; // eases each effect in after a gesture change
    const { vx, vy } = { vx: h.vel.x, vy: h.vel.y };
    const spin = key.startsWith('Left') ? 1 : -1; // the two hands swirl in opposite directions
    const add = (p: Point2, radius: number, attract: number, swirl: number, drag: number) =>
      forces.push({ x: p.x, y: p.y, radius, attract: attract * b, swirl: swirl * b * spin, drag: drag * b, vx, vy });

    switch (h.stabilizer.current) {
      case 'open': // rain falls in a strip under your palm
        rain.push({ x: h.palm.x, ...RAIN, strength: b });
        break;
      case 'fist': // the big outward scatter happens once, in onGestureStart; this keeps the space clear
        add(h.palm, 0.8, -1.2, 0, 0.5);
        break;
      case 'point': // a strong swarm that follows the index fingertip
        add(h.world[8], 1.6, 2.6, 1.2, 1.2);
        break;
      case 'pinch':
        add(pinchPoint(h), 0.5, 1.4, 3.5, 0.8);
        break;
      case 'peace':
        add(h.world[8], 0.4, 1.6, -1.8, 1.2);
        add(h.world[12], 0.4, 1.6, 1.8, 1.2);
        break;
      default: // any other hand shape: particles still gently follow the index fingertip
        add(h.world[8], 1.1, 1.5, 0.8, 1.0);
    }
  }
  return { forces, rain };
}

// ---------- Mouse fallback (so you can play before starting the camera) ----------
const mouse = { x: 0, y: 0, vx: 0, vy: 0, last: 0 };
window.addEventListener('pointermove', (e) => {
  const x = (e.clientX / window.innerWidth) * 2 * aspect - aspect;
  const y = 1 - (e.clientY / window.innerHeight) * 2;
  const now = performance.now();
  const dt = Math.max((now - mouse.last) / 1000, 1 / 120);
  if (dt < 0.2) {
    mouse.vx += ((x - mouse.x) / dt - mouse.vx) * 0.4;
    mouse.vy += ((y - mouse.y) / dt - mouse.vy) * 0.4;
  }
  Object.assign(mouse, { x, y, last: now });
});

// ---------- Main loop ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const time = clock.elapsedTime;
  const now = performance.now();

  // Only run hand tracking when the camera has produced a new frame.
  if (landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const handResult = landmarker.detectForVideo(video, now);
    handleResult(handResult, now);
    wand.detect(video, handResult.landmarks, now);
    // Face tracking feeds both the hat and the vignette; it's skipped when neither is on.
    if (faceLandmarker && (hat.enabled || vignette.enabled)) {
      const face = faceLandmarker.detectForVideo(video, now).faceLandmarks[0];
      if (face) {
        hat.place(face, now, toWorld);
        vignette.setFace(face, now, toScreen);
      }
    }
  }
  hat.update(dt, now);
  vignette.update(dt, now);

  // Forget hands that left the frame a moment ago.
  for (const [key, h] of hands) if (now - h.lastSeen > 300) hands.delete(key);

  for (const h of hands.values()) h.blend = Math.min(1, h.blend + dt / 0.5);

  const { forces, rain } = buildForces();
  if (hands.size === 0 && now - mouse.last < 1500) {
    // Before the camera is on, the cursor acts like a fingertip.
    forces.push({ x: mouse.x, y: mouse.y, radius: 1.1, attract: 1.5, swirl: 0.8, drag: 1, vx: mouse.vx, vy: mouse.vy });
  }

  for (const h of hands.values()) {
    const g = h.stabilizer.current;
    if (g === 'pinch') {
      // While pinching, keep sprinkling new sparkles from the pinch point.
      const p = pinchPoint(h);
      particles.emit(p.x, p.y, Math.ceil(1200 * dt), 0.2, 1.0);
    } else if (g === 'open') {
      // While the palm is open, keep dropping fresh raindrops from the top of the screen.
      particles.rain(h.palm.x, RAIN.halfWidth, Math.ceil(700 * dt * h.blend), RAIN.speed);
    }
  }

  particles.update(dt, time, forces, rain);

  wand.update(dt, now);
  wandTrail.update(wand.pos && toWorld(wand.pos.x, wand.pos.y), now, time);

  const handList = [...hands.values()];
  skeletons.forEach((s, i) => (handList[i] ? s.update(handList[i].world) : s.hide()));
  updateHud();

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- On-screen text ----------
let lastHudText = '';
function updateHud() {
  if (!landmarker) return;
  const active = new Set<Gesture>();
  const parts: string[] = [];
  for (const [key, h] of hands) {
    active.add(h.stabilizer.current);
    parts.push(`${key.replace(/\d+$/, '')}: ${GESTURE_LABELS[h.stabilizer.current]}`);
  }
  const text = parts.length ? parts.join(' · ') : 'Show your hand to the camera 👋';
  if (text !== lastHudText) {
    statusEl.textContent = lastHudText = text;
    legendItems.forEach((li) => li.classList.toggle('active', active.has(li.dataset.gesture as Gesture)));
  }

  const wandText = calibrating
    ? `Wand: ${calibrationHint}`
    : wand.source === 'color'
      ? 'Wand: tracked'
      : wand.source === 'hand'
        ? 'Wand: tracked (estimated from hand)'
        : 'Wand: lost';
  if (wandText !== lastWandText) {
    wandStatusEl.textContent = lastWandText = wandText;
    wandStatusEl.dataset.state = calibrating ? 'calibrating' : wand.source;
  }
}
let lastWandText = '';

// ---------- Buttons ----------
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  errorEl.textContent = '';
  startBtn.textContent = 'Starting…';
  try {
    // Start the camera and load the model at the same time.
    const [lm] = await Promise.all([createHandLandmarker(), startCamera(video)]);
    landmarker = lm;
    intro.hidden = true;
    intro.style.display = 'none';
    hud.hidden = false;
    loadFaceTracking();
  } catch (err) {
    console.error(err);
    errorEl.textContent = err instanceof Error ? err.message : String(err);
    startBtn.disabled = false;
    startBtn.textContent = 'Try again';
  }
});

/** Loads the face model in the background; hand tracking keeps running meanwhile. */
async function loadFaceTracking() {
  hatBtn.disabled = true;
  hatBtn.textContent = 'Hat: loading…';
  try {
    faceLandmarker = await createFaceLandmarker();
    hatBtn.disabled = false;
    hatBtn.textContent = hat.enabled ? 'Hat: On' : 'Hat: Off';
  } catch (err) {
    console.error('Face tracking failed to load', err);
    hatBtn.textContent = 'Hat unavailable';
  }
}

hatBtn.addEventListener('click', () => {
  hat.enabled = !hat.enabled;
  hatBtn.textContent = hat.enabled ? 'Hat: On' : 'Hat: Off';
  hatBtn.setAttribute('aria-pressed', String(hat.enabled));
});

// Dim: On = "dark magic" vignette + cool tint. Dim: Off = fully clear camera.
dimBtn.addEventListener('click', () => {
  vignette.enabled = document.body.classList.toggle('dim');
  dimBtn.textContent = vignette.enabled ? 'Dim: On' : 'Dim: Off';
  dimBtn.setAttribute('aria-pressed', String(vignette.enabled));
});
paletteBtn.addEventListener('click', nextPalette);

// ---------- Wand calibration ----------
// Click "Calibrate wand", then click the wand tip on the video: its color becomes the tracked color.
const CALIBRATION_HINT = 'click the wand tip on screen (Esc to cancel)';
let calibrating = false;
let calibrationHint = CALIBRATION_HINT;
function setCalibrating(on: boolean) {
  calibrating = on;
  calibrationHint = CALIBRATION_HINT;
  document.body.classList.toggle('calibrating', on);
  wandBtn.setAttribute('aria-pressed', String(on));
  wandBtn.textContent = on ? 'Cancel calibration' : 'Calibrate wand';
}
function showWandColor() {
  wandBtn.style.setProperty('--wand-color', profileColor(wand.profile));
}
showWandColor();

wandBtn.addEventListener('click', () => setCalibrating(!calibrating));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && calibrating) setCalibrating(false);
});
window.addEventListener('pointerdown', (e) => {
  if (!calibrating || hud.contains(e.target as Node)) return;
  e.preventDefault();
  const p = fromScreen(e.clientX, e.clientY);
  const problem = wand.calibrate(video, p.x, p.y);
  if (problem) {
    calibrationHint = `${problem} (Esc to cancel)`;
    return; // stay in calibration mode so you can click again
  }
  setCalibrating(false);
  showWandColor();
});
