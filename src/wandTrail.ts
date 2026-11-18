import * as THREE from 'three';
import type { Point2 } from './gestures';

/** How long a point of the trail stays visible, in ms. */
const TRAIL_MS = 500;
const MAX_POINTS = 128;
const HALF_WIDTH = 0.05; // ribbon half-width at the tip, in scene units (screen height = 2)

const GOLD = new THREE.Color('#ffcc3d');
const CORE = new THREE.Color('#fff4cf');

/**
 * A glowing gold ribbon that follows the wand tip and fades out over ~0.5 s,
 * plus a soft glowing spark at the tip itself.
 */
export class WandTrail {
  readonly group = new THREE.Group();
  private readonly points: { x: number; y: number; t: number }[] = [];

  private readonly pos = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly edge = new Float32Array(MAX_POINTS * 2);
  private readonly fade = new Float32Array(MAX_POINTS * 2);
  private readonly ribbon: THREE.Mesh;
  private readonly tip: THREE.Points;
  private readonly tipPos = new Float32Array(3);
  private readonly tipMat: THREE.ShaderMaterial;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aEdge', new THREE.BufferAttribute(this.edge, 1));
    geo.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1));
    // Two triangles between each pair of neighboring trail points.
    const index: number[] = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);

    this.ribbon = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uGold: { value: GOLD }, uCore: { value: CORE } },
        vertexShader: /* glsl */ `
          attribute float aEdge;
          attribute float aFade;
          varying float vEdge;
          varying float vFade;
          void main() {
            vEdge = aEdge;
            vFade = aFade;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uGold;
          uniform vec3 uCore;
          varying float vEdge;
          varying float vFade;
          void main() {
            float d = abs(vEdge);
            float glow = exp(-d * d * 3.5);   // wide soft gold halo
            float core = exp(-d * d * 40.0);  // thin bright center line
            float f = vFade * (0.4 + 0.6 * vFade); // eases out toward the tail
            // Brightness goes in alpha (like the particles), so the glow blends onto the
            // see-through canvas instead of leaving a dark fringe.
            float a = clamp((glow * 1.1 + core * 1.2) * f, 0.0, 1.0);
            vec3 col = mix(uGold, uCore, core / (glow + core));
            gl_FragColor = vec4(col, a);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );

    const tipGeo = new THREE.BufferGeometry();
    tipGeo.setAttribute('position', new THREE.BufferAttribute(this.tipPos, 3));
    this.tipMat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 60 }, uTime: { value: 0 }, uGold: { value: GOLD }, uCore: { value: CORE } },
      vertexShader: /* glsl */ `
        uniform float uSize;
        uniform float uTime;
        void main() {
          gl_PointSize = uSize * (0.9 + 0.1 * sin(uTime * 9.0)); // a gentle twinkle
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uGold;
        uniform vec3 uCore;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float glow = exp(-d * d * 4.5);
          float core = exp(-d * d * 60.0);
          float a = clamp(glow * 1.2 + core, 0.0, 1.0);
          gl_FragColor = vec4(mix(uGold, uCore, core / (glow + core)), a);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.tip = new THREE.Points(tipGeo, this.tipMat);

    this.ribbon.frustumCulled = this.tip.frustumCulled = false;
    this.ribbon.renderOrder = 25; // above the particles, below the hand outline
    this.tip.renderOrder = 26;
    this.group.add(this.ribbon, this.tip);
  }

  setPixelRatio(dpr: number) {
    this.tipMat.uniforms.uSize.value = 56 * dpr;
  }

  /**
   * Call every frame with the tip position in scene coordinates, or null when the wand is lost.
   * When lost, the existing trail just fades out.
   */
  update(p: Point2 | null, now: number, time: number) {
    const pts = this.points;
    if (p) {
      pts.push({ x: p.x, y: p.y, t: now });
    } else if (pts.length && now - pts[pts.length - 1].t > TRAIL_MS) {
      pts.length = 0; // everything has faded; the next sighting starts a fresh trail
    }
    while (pts.length && now - pts[0].t > TRAIL_MS) pts.shift();
    while (pts.length > MAX_POINTS) pts.shift();

    this.tip.visible = !!p;
    if (p) {
      this.tipPos.set([p.x, p.y, 0.6]);
      this.tip.geometry.attributes.position.needsUpdate = true;
      this.tipMat.uniforms.uTime.value = time;
    }

    const n = pts.length;
    this.ribbon.visible = n >= 2;
    if (n < 2) return;

    for (let i = 0; i < n; i++) {
      // The ribbon's sides point across the direction of travel.
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x;
      let ty = b.y - a.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      const f = Math.max(0, 1 - (now - pts[i].t) / TRAIL_MS); // 1 = brand new, 0 = gone
      const w = HALF_WIDTH * (0.2 + 0.8 * f); // tapers toward the tail
      const { x, y } = pts[i];
      this.pos.set([x - ty * w, y + tx * w, 0.6, x + ty * w, y - tx * w, 0.6], i * 6);
      this.edge[i * 2] = -1;
      this.edge[i * 2 + 1] = 1;
      this.fade[i * 2] = this.fade[i * 2 + 1] = f;
    }
    const geo = this.ribbon.geometry;
    geo.setDrawRange(0, (n - 1) * 6);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aEdge.needsUpdate = true;
    geo.attributes.aFade.needsUpdate = true;
  }
}
