import * as THREE from 'three';

/**
 * A force a hand applies to nearby particles.
 * - attract > 0 pulls particles in, < 0 pushes them away
 * - swirl spins them around the center
 * - drag carries them along with the hand's own movement (vx, vy)
 */
export interface Force {
  x: number;
  y: number;
  radius: number;
  attract: number;
  swirl: number;
  drag: number;
  vx: number;
  vy: number;
}

/** A vertical strip where particles are pulled into falling straight down, like rain. */
export interface RainZone {
  x: number;
  halfWidth: number;
  speed: number;
  strength: number; // 0..1, used to fade the rain in and out
}

export const PALETTES: { name: string; colors: [string, string, string] }[] = [
  { name: 'Blue', colors: ['#0a5cff', '#1fc8ff', '#a8dcff'] },
  { name: 'Neon', colors: ['#00e5ff', '#ff2bd6', '#ffe14d'] },
  { name: 'Sunset', colors: ['#ff7a18', '#ff3d7f', '#7b2ff7'] },
  { name: 'Aurora', colors: ['#3dffa8', '#00b3ff', '#6a4bff'] },
  { name: 'Fire', colors: ['#ff2a00', '#ff9500', '#ffe7a3'] },
  { name: 'Candy', colors: ['#ff9ad5', '#a0f0ff', '#fff3a0'] },
];

// The GPU colors each particle. Faster particles get bigger and brighter.
const vertexShader = /* glsl */ `
  uniform float uSize;
  uniform float uTime;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  attribute float aSeed;
  attribute float aSpeed;
  varying vec3 vColor;
  varying float vGlow;

  void main() {
    float s = fract(aSeed + uTime * 0.02) * 3.0;
    vec3 c = s < 1.0 ? mix(uC1, uC2, s) : s < 2.0 ? mix(uC2, uC3, s - 1.0) : mix(uC3, uC1, s - 2.0);
    float boost = clamp(aSpeed * 0.6, 0.0, 1.0);
    vColor = mix(c, vec3(1.0), boost * 0.45);
    vGlow = 0.6 + boost * 0.9;
    float sizeVariation = 0.6 + fract(aSeed * 91.7) * 0.9;
    gl_PointSize = uSize * 1.5 * sizeVariation * (1.0 + boost * 1.2); // larger, to leave room for the halo
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vGlow;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float r = 1.0 - d * 2.0;
    float core = pow(r, 3.0);        // bright center
    float halo = pow(r, 1.2) * 0.35; // soft glow around it
    gl_FragColor = vec4(vColor * vGlow, core + halo);
  }
`;

export class ParticleField {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly speed: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly targetColors = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  private emitCursor = 0;
  private bx = 1;
  private by = 1;

  constructor(readonly count: number) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 2);
    this.speed = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = (Math.random() * 2 - 1) * 1.8;
      this.pos[i * 3 + 1] = Math.random() * 2 - 1;
      this.pos[i * 3 + 2] = Math.random() * 0.1;
      seeds[i] = Math.random();
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(this.speed, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const [c1, c2, c3] = PALETTES[0].colors.map((c) => new THREE.Color(c));
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSize: { value: 4 },
        uTime: { value: 0 },
        uC1: { value: c1 },
        uC2: { value: c2 },
        uC3: { value: c3 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // overlapping particles add up into a glow
    });
    this.setPalette(0);
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** The visible area runs from -bx..bx horizontally and -by..by vertically. */
  setBounds(bx: number, by: number) {
    this.bx = bx;
    this.by = by;
  }

  setPointSize(px: number) {
    this.material.uniforms.uSize.value = px;
  }

  /** Fades to a new color theme over the next second or so. */
  setPalette(index: number) {
    PALETTES[index].colors.forEach((c, i) => this.targetColors[i].set(c));
  }

  /** Re-launches `n` particles from a point, flying outward. */
  emit(x: number, y: number, n: number, minSpeed: number, maxSpeed: number) {
    for (let k = 0; k < n; k++) {
      const i = this.emitCursor;
      this.emitCursor = (this.emitCursor + 1) % this.count;
      const angle = Math.random() * Math.PI * 2;
      const s = minSpeed + Math.random() * (maxSpeed - minSpeed);
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.vel[i * 2] = Math.cos(angle) * s;
      this.vel[i * 2 + 1] = Math.sin(angle) * s;
    }
  }

  /** Drops `n` particles from just above the top of the screen, spread around x. */
  rain(x: number, halfWidth: number, n: number, speed: number) {
    for (let k = 0; k < n; k++) {
      const i = this.emitCursor;
      this.emitCursor = (this.emitCursor + 1) % this.count;
      this.pos[i * 3] = x + (Math.random() * 2 - 1) * halfWidth;
      this.pos[i * 3 + 1] = this.by + 0.05 + Math.random() * 0.1;
      this.vel[i * 2] = (Math.random() - 0.5) * 0.05;
      this.vel[i * 2 + 1] = -speed * (0.7 + Math.random() * 0.6);
    }
  }

  /** Throws every particle directly away from (x, y), with a little randomness. */
  scatter(x: number, y: number, strength: number) {
    const { pos, vel } = this;
    for (let i = 0; i < this.count; i++) {
      const dx = pos[i * 3] - x;
      const dy = pos[i * 3 + 1] - y;
      const d = Math.hypot(dx, dy) + 1e-4;
      const s = strength * (0.6 + Math.random() * 0.4);
      vel[i * 2] += (dx / d) * s;
      vel[i * 2 + 1] += (dy / d) * s;
    }
  }

  /** A sudden outward shove for every particle near (x, y), like a shockwave. */
  impulse(x: number, y: number, radius: number, strength: number) {
    const { pos, vel } = this;
    for (let i = 0; i < this.count; i++) {
      const dx = pos[i * 3] - x;
      const dy = pos[i * 3 + 1] - y;
      const d = Math.hypot(dx, dy);
      if (d > radius || d < 1e-4) continue;
      const f = (1 - d / radius) * strength;
      vel[i * 2] += (dx / d) * f;
      vel[i * 2 + 1] += (dy / d) * f;
    }
  }

  /** Advances the simulation by `dt` seconds. */
  update(dt: number, time: number, forces: Force[], rain: RainZone[] = []) {
    const { pos, vel, speed, bx, by } = this;
    // Low air resistance, so particles keep gliding after being pushed (floaty feel).
    const damping = Math.exp(-0.7 * dt);
    const ambient = 0.2;
    const maxSpeed = 2.5;
    const mx = bx + 0.1;
    const my = by + 0.1;

    for (let i = 0; i < this.count; i++) {
      const px = pos[i * 3];
      const py = pos[i * 3 + 1];
      let vx = vel[i * 2];
      let vy = vel[i * 2 + 1];

      // A slow, wavy current so the particles drift even when no hand is around.
      vx += (Math.sin(py * 1.7 + time * 0.4) * 0.6 + Math.sin(py * 3.1 - time * 0.7 + px) * 0.25) * ambient * dt;
      vy += (Math.cos(px * 1.5 - time * 0.35) * 0.6 + Math.cos(px * 2.7 + time * 0.6 - py) * 0.25) * ambient * dt;

      for (let f = 0; f < forces.length; f++) {
        const F = forces[f];
        const dx = px - F.x;
        const dy = py - F.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > F.radius * F.radius) continue;
        const d = Math.sqrt(d2) + 1e-4;
        const fall = 1 - d / F.radius; // stronger closer to the hand
        const nx = dx / d;
        const ny = dy / d;
        const pull = d < 0.04 ? 0 : F.attract * fall;
        vx += (-nx * pull - ny * F.swirl * fall + (F.vx - vx) * F.drag * fall) * dt;
        vy += (-ny * pull + nx * F.swirl * fall + (F.vy - vy) * F.drag * fall) * dt;
      }

      for (let r = 0; r < rain.length; r++) {
        const R = rain[r];
        const off = Math.abs(px - R.x);
        if (off > R.halfWidth) continue;
        const k = (1 - off / R.halfWidth) * R.strength * 3 * dt; // softer at the edges of the strip
        vx += (0 - vx) * k;
        vy += (-R.speed - vy) * k;
      }

      vx *= damping;
      vy *= damping;
      const sp = Math.hypot(vx, vy);
      if (sp > maxSpeed) {
        vx *= maxSpeed / sp;
        vy *= maxSpeed / sp;
      }
      let nxp = px + vx * dt;
      let nyp = py + vy * dt;
      // Particles leaving one edge come back in on the opposite edge.
      if (nxp > mx) nxp -= 2 * mx;
      else if (nxp < -mx) nxp += 2 * mx;
      if (nyp > my) nyp -= 2 * my;
      else if (nyp < -my) nyp += 2 * my;

      pos[i * 3] = nxp;
      pos[i * 3 + 1] = nyp;
      vel[i * 2] = vx;
      vel[i * 2 + 1] = vy;
      speed[i] = Math.hypot(vx, vy);
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aSpeed.needsUpdate = true;

    const u = this.material.uniforms;
    u.uTime.value = time;
    const blend = 1 - Math.exp(-4 * dt);
    (u.uC1.value as THREE.Color).lerp(this.targetColors[0], blend);
    (u.uC2.value as THREE.Color).lerp(this.targetColors[1], blend);
    (u.uC3.value as THREE.Color).lerp(this.targetColors[2], blend);
  }
}
