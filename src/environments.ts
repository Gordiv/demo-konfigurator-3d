import * as THREE from 'three';
import type { EnvironmentId, Theme } from './config';

export interface BackdropPalette {
  base: string;
  glow1: string;
  glow2: string;
  glow3: string;
}

interface LightSpec {
  color: string;
  intensity: number;
  position: [number, number, number];
}

export interface EnvironmentDef {
  id: EnvironmentId;
  name: string;
  description: string;
  /** CSS gradient used for the preview dot in the picker. */
  swatch: string;
  exposure: number;
  envIntensity: number;
  key: LightSpec;
  rims: [LightSpec, LightSpec];
  shadowOpacity: number;
  palette: Record<Theme, BackdropPalette>;
}

export const ENVIRONMENTS: readonly EnvironmentDef[] = [
  {
    id: 'studio',
    name: 'Studio',
    description: 'Miękkie softboxy, neutralne światło',
    swatch: 'radial-gradient(circle at 35% 30%, #ffffff, #b9bfcc 45%, #4a505e)',
    exposure: 1.0,
    envIntensity: 1.0,
    key: { color: '#ffffff', intensity: 2.2, position: [-3, 6.5, 3] },
    rims: [
      { color: '#dfe6ff', intensity: 0.6, position: [4, 3, -4] },
      { color: '#ffffff', intensity: 0, position: [-4, 2, -4] },
    ],
    shadowOpacity: 0.55,
    palette: {
      dark: { base: '#0b0c12', glow1: 'rgba(122, 140, 196, 0.34)', glow2: 'rgba(98, 84, 168, 0.26)', glow3: 'rgba(206, 214, 236, 0.13)' },
      light: { base: '#e9ebf0', glow1: 'rgba(255, 255, 255, 0.95)', glow2: 'rgba(166, 182, 224, 0.5)', glow3: 'rgba(255, 255, 255, 0.85)' },
    },
  },
  {
    id: 'gallery',
    name: 'Galeria',
    description: 'Dzienne światło z wysokich okien',
    swatch: 'radial-gradient(circle at 35% 30%, #ffffff, #bfe0ef 45%, #5a7f8f)',
    exposure: 0.95,
    envIntensity: 1.1,
    key: { color: '#fff6ea', intensity: 2.8, position: [4.5, 7, 3] },
    rims: [
      { color: '#cfe6ff', intensity: 0.7, position: [-5, 3, -3] },
      { color: '#ffffff', intensity: 0, position: [4, 2, -4] },
    ],
    shadowOpacity: 0.6,
    palette: {
      dark: { base: '#0a0f14', glow1: 'rgba(104, 168, 210, 0.3)', glow2: 'rgba(66, 128, 116, 0.24)', glow3: 'rgba(220, 236, 242, 0.12)' },
      light: { base: '#ebf0f3', glow1: 'rgba(255, 255, 255, 0.95)', glow2: 'rgba(150, 204, 222, 0.5)', glow3: 'rgba(255, 249, 238, 0.85)' },
    },
  },
  {
    id: 'sunset',
    name: 'Zachód',
    description: 'Ciepłe, niskie słońce i długie cienie',
    swatch: 'radial-gradient(circle at 35% 30%, #ffe2b8, #f08a4b 45%, #5d2140)',
    exposure: 0.95,
    envIntensity: 1.0,
    key: { color: '#ffb47a', intensity: 3.2, position: [-6.5, 2.6, 2.5] },
    rims: [
      { color: '#7f8cff', intensity: 0.9, position: [5, 2.5, -3] },
      { color: '#ff7a59', intensity: 0.5, position: [-3, 1.5, -5] },
    ],
    shadowOpacity: 0.62,
    palette: {
      dark: { base: '#120a0d', glow1: 'rgba(255, 128, 66, 0.34)', glow2: 'rgba(184, 58, 112, 0.3)', glow3: 'rgba(255, 190, 122, 0.13)' },
      light: { base: '#f5e9e2', glow1: 'rgba(255, 186, 136, 0.7)', glow2: 'rgba(238, 146, 170, 0.48)', glow3: 'rgba(255, 242, 228, 0.85)' },
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Ciemne wnętrze, kolorowe świetlówki',
    swatch: 'radial-gradient(circle at 35% 30%, #ff9de0, #c13cff 45%, #12c8ff)',
    exposure: 1.05,
    envIntensity: 1.25,
    key: { color: '#e9e2ff', intensity: 0.9, position: [-2, 7, 4] },
    rims: [
      { color: '#ff3fb4', intensity: 2.4, position: [-5, 2.5, -2.5] },
      { color: '#22c8ff', intensity: 2.2, position: [5, 2, -2] },
    ],
    shadowOpacity: 0.7,
    palette: {
      dark: { base: '#07060d', glow1: 'rgba(255, 44, 170, 0.32)', glow2: 'rgba(32, 196, 255, 0.28)', glow3: 'rgba(146, 96, 255, 0.16)' },
      light: { base: '#eeebf5', glow1: 'rgba(255, 126, 212, 0.5)', glow2: 'rgba(96, 210, 255, 0.5)', glow3: 'rgba(255, 255, 255, 0.8)' },
    },
  },
];

export function getEnvironment(id: EnvironmentId): EnvironmentDef {
  return ENVIRONMENTS.find((env) => env.id === id) ?? ENVIRONMENTS[0]!;
}

/** Linear RGB triple (values above 1 are HDR). */
type RGB = [number, number, number];

interface SceneSpec {
  sky: { top: RGB; horizon: RGB; bottom: RGB; sharpness: number };
  panels: { size: [number, number]; position: [number, number, number]; color: RGB; round?: boolean }[];
  rings?: { radius: number; tube: number; y: number; color: RGB }[];
}

const SCENES: Record<EnvironmentId, SceneSpec> = {
  studio: {
    sky: { top: [0.42, 0.43, 0.46], horizon: [0.2, 0.205, 0.22], bottom: [0.035, 0.035, 0.04], sharpness: 1.6 },
    panels: [
      { size: [7, 7], position: [0, 9, 0], color: [7, 7, 7.2] },
      { size: [1.6, 8], position: [-8, 3, 2.5], color: [5.5, 5.5, 5.8] },
      { size: [1.6, 8], position: [8, 3, -1.5], color: [3.8, 3.9, 4.2] },
      { size: [7, 3], position: [0, 1.5, 10], color: [1.3, 1.3, 1.35] },
      { size: [5, 2], position: [-2, 6, -9], color: [2.2, 2.25, 2.4] },
    ],
  },
  gallery: {
    sky: { top: [0.5, 0.6, 0.78], horizon: [0.95, 0.95, 0.92], bottom: [0.05, 0.045, 0.04], sharpness: 1.1 },
    panels: [
      { size: [3, 6], position: [9, 4, 1], color: [9, 9.2, 9.6] },
      { size: [3, 6], position: [9, 4, -4.5], color: [9, 9.2, 9.6] },
      { size: [10, 1.2], position: [0, 9.5, 0], color: [3, 3, 3] },
      { size: [6, 4], position: [-9, 2.5, 0], color: [0.9, 0.85, 0.78] },
    ],
  },
  sunset: {
    sky: { top: [0.05, 0.06, 0.2], horizon: [2.6, 1.0, 0.42], bottom: [0.09, 0.04, 0.05], sharpness: 2.4 },
    panels: [
      { size: [2.6, 2.6], position: [-12, 1.6, 6], color: [40, 20, 8], round: true },
      { size: [9, 9], position: [-14, 1.4, 7], color: [2.6, 1.1, 0.5], round: true },
      { size: [6, 3], position: [10, 2.5, -5], color: [0.45, 0.55, 1.4] },
      { size: [8, 4], position: [0, 8.5, 0], color: [0.6, 0.45, 0.8] },
    ],
  },
  neon: {
    sky: { top: [0.02, 0.016, 0.04], horizon: [0.045, 0.03, 0.075], bottom: [0.01, 0.01, 0.014], sharpness: 1.5 },
    panels: [
      { size: [0.5, 9], position: [-6, 2.5, 3], color: [14, 3.2, 9] },
      { size: [0.5, 9], position: [6.5, 2.5, -1], color: [3.2, 9.5, 14] },
      { size: [5, 0.35], position: [0, 1, 9], color: [6, 3, 14] },
      { size: [0.4, 6], position: [-3, 3, -9], color: [12, 4, 2] },
    ],
    rings: [{ radius: 4, tube: 0.12, y: 7, color: [5, 2.5, 12] }],
  },
};

/** Builds a small HDR scene that PMREMGenerator turns into an environment map. No image files involved. */
export function buildEnvironmentScene(id: EnvironmentId): THREE.Scene {
  const spec = SCENES[id];
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(20, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Vector3(...spec.sky.top) },
        horizon: { value: new THREE.Vector3(...spec.sky.horizon) },
        bottom: { value: new THREE.Vector3(...spec.sky.bottom) },
        sharpness: { value: spec.sky.sharpness },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 bottom;
        uniform float sharpness;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 up = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 1.0 / sharpness));
          vec3 down = mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.5));
          gl_FragColor = vec4(h >= 0.0 ? up : down, 1.0);
        }`,
    }),
  );
  scene.add(sky);

  for (const panel of spec.panels) {
    const geometry = panel.round ? new THREE.CircleGeometry(panel.size[0] / 2, 48) : new THREE.PlaneGeometry(panel.size[0], panel.size[1]);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    material.color.setRGB(...panel.color);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...panel.position);
    mesh.lookAt(0, mesh.position.y > 7 ? 0 : mesh.position.y, 0);
    scene.add(mesh);
  }
  for (const ring of spec.rings ?? []) {
    const material = new THREE.MeshBasicMaterial();
    material.color.setRGB(...ring.color);
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(ring.radius, ring.tube, 12, 96), material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = ring.y;
    scene.add(mesh);
  }
  return scene;
}

export function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
}
