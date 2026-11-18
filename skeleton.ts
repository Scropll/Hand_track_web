import * as THREE from 'three';
import { HandLandmarker } from '@mediapipe/tasks-vision';
import type { Point2 } from './gestures';

/** Draws a faint glowing outline of one hand: bones as lines, joints as dots. */
export class HandSkeleton {
  readonly group = new THREE.Group();
  private readonly linePos: Float32Array;
  private readonly jointPos = new Float32Array(21 * 3);
  private readonly lines: THREE.LineSegments;
  private readonly joints: THREE.Points;

  constructor() {
    const connections = HandLandmarker.HAND_CONNECTIONS;
    this.linePos = new Float32Array(connections.length * 2 * 3);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    );

    const jointGeo = new THREE.BufferGeometry();
    jointGeo.setAttribute('position', new THREE.BufferAttribute(this.jointPos, 3));
    this.joints = new THREE.Points(
      jointGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );

    this.lines.frustumCulled = this.joints.frustumCulled = false;
    this.lines.renderOrder = this.joints.renderOrder = 30; // drawn on top of the hat and particles
    this.group.add(this.lines, this.joints);
    this.group.visible = false;
  }

  update(pts: Point2[]) {
    HandLandmarker.HAND_CONNECTIONS.forEach(({ start, end }, i) => {
      this.linePos.set([pts[start].x, pts[start].y, 0.5, pts[end].x, pts[end].y, 0.5], i * 6);
    });
    pts.forEach((p, i) => this.jointPos.set([p.x, p.y, 0.5], i * 3));
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.joints.geometry.attributes.position.needsUpdate = true;
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }
}
