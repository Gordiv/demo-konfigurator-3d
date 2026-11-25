import * as THREE from 'three';

/**
 * A lathe surface whose profile can be replaced every frame without allocating:
 * positions and normals are rewritten in place, the index buffer never changes.
 */
export class LatheSurface {
  readonly geometry = new THREE.BufferGeometry();
  private readonly points: number;
  private readonly segments: number;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly sin: Float32Array;
  private readonly cos: Float32Array;
  private readonly profileNormals: Float32Array;
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly normalAttr: THREE.BufferAttribute;

  constructor(points: number, segments: number, boundingRadius = 2.4) {
    this.points = points;
    this.segments = segments;
    const vertices = (segments + 1) * points;
    this.positions = new Float32Array(vertices * 3);
    this.normals = new Float32Array(vertices * 3);
    this.profileNormals = new Float32Array(points * 2);
    this.sin = new Float32Array(segments + 1);
    this.cos = new Float32Array(segments + 1);
    for (let i = 0; i <= segments; i++) {
      // Close the seam exactly so there is no visible crack.
      const phi = i === segments ? 0 : (i / segments) * Math.PI * 2;
      this.sin[i] = Math.sin(phi);
      this.cos[i] = Math.cos(phi);
    }
    const indexCount = segments * (points - 1) * 6;
    const index = vertices > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    let k = 0;
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < points - 1; j++) {
        const a = i * points + j;
        const b = a + points;
        const c = b + 1;
        const d = a + 1;
        index[k++] = a;
        index[k++] = b;
        index[k++] = d;
        index[k++] = c;
        index[k++] = d;
        index[k++] = b;
      }
    }
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.normalAttr = new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('normal', this.normalAttr);
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
    // Fixed bounds: recomputing them every morph frame would be wasted work.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), boundingRadius);
    this.geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-boundingRadius, -0.5, -boundingRadius), new THREE.Vector3(boundingRadius, boundingRadius * 1.2, boundingRadius));
  }

  /** `profile` holds (radius, height) pairs, `points` of them. */
  update(profile: Float32Array): void {
    const n = this.points;
    const pn = this.profileNormals;
    // Profile normals: average of the two adjacent segment normals, (dy, -dx) per segment.
    for (let j = 0; j < n; j++) {
      let nx = 0;
      let ny = 0;
      if (j > 0) {
        const dx = profile[j * 2]! - profile[(j - 1) * 2]!;
        const dy = profile[j * 2 + 1]! - profile[(j - 1) * 2 + 1]!;
        const len = Math.hypot(dx, dy) || 1;
        nx += dy / len;
        ny -= dx / len;
      }
      if (j < n - 1) {
        const dx = profile[(j + 1) * 2]! - profile[j * 2]!;
        const dy = profile[(j + 1) * 2 + 1]! - profile[j * 2 + 1]!;
        const len = Math.hypot(dx, dy) || 1;
        nx += dy / len;
        ny -= dx / len;
      }
      const len = Math.hypot(nx, ny) || 1;
      pn[j * 2] = nx / len;
      pn[j * 2 + 1] = ny / len;
    }

    const pos = this.positions;
    const nor = this.normals;
    let k = 0;
    for (let i = 0; i <= this.segments; i++) {
      const s = this.sin[i]!;
      const c = this.cos[i]!;
      for (let j = 0; j < n; j++) {
        const r = profile[j * 2]!;
        const nx = pn[j * 2]!;
        pos[k] = r * s;
        pos[k + 1] = profile[j * 2 + 1]!;
        pos[k + 2] = r * c;
        nor[k] = nx * s;
        nor[k + 1] = pn[j * 2 + 1]!;
        nor[k + 2] = nx * c;
        k += 3;
      }
    }
    this.positionAttr.needsUpdate = true;
    this.normalAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
