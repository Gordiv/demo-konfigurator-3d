import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getColor, type Config, type FinishId, type ShapeId, type Theme } from './config';

export interface Stage {
  setConfig(config: Config): void;
  setAutoRotate(enabled: boolean): void;
  setSpeed(rpm: number): void;
  setWireframe(enabled: boolean): void;
  setTheme(theme: Theme): void;
  snapshot(): Promise<Blob | null>;
}

interface StageOptions {
  reducedMotion: boolean;
  onFirstInteraction?: () => void;
}

type ProductMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

const v = (x: number, y: number) => new THREE.Vector2(x, y);

/** Outer silhouettes (radius, height). The wall and the inner cavity are derived from them. */
const PROFILES: Record<ShapeId, { outer: THREE.Vector2[]; wall: number; innerBottom: number }> = {
  vase: {
    outer: [v(0.36, 0), v(0.46, 0.06), v(0.62, 0.32), v(0.7, 0.62), v(0.62, 0.98), v(0.4, 1.26), v(0.27, 1.46), v(0.29, 1.62), v(0.37, 1.74)],
    wall: 0.035,
    innerBottom: 0.14,
  },
  bottle: {
    outer: [v(0.44, 0), v(0.5, 0.05), v(0.52, 0.3), v(0.52, 0.72), v(0.46, 0.96), v(0.28, 1.14), v(0.16, 1.3), v(0.14, 1.56), v(0.165, 1.66), v(0.16, 1.74)],
    wall: 0.03,
    innerBottom: 1.2,
  },
  planter: {
    outer: [v(0.5, 0), v(0.57, 0.05), v(0.64, 0.32), v(0.72, 0.66), v(0.79, 0.9), v(0.86, 0.96), v(0.87, 1.06)],
    wall: 0.06,
    innerBottom: 0.16,
  },
};

const SCENE_COLORS: Record<Theme, { pedestal: number; shadow: number }> = {
  light: { pedestal: 0xf3f3f1, shadow: 0.14 },
  dark: { pedestal: 0x252930, shadow: 0.35 },
};

const WHITE = new THREE.Color(0xffffff);
const DEFAULT_RPM = 6;
/** Narrowest aspect ratio that still uses the base field of view. */
const FRAMING_ASPECT = 0.9;
const BASE_HALF_FOV = THREE.MathUtils.degToRad(16);

function buildProductGeometry(shape: ShapeId): THREE.LatheGeometry {
  const { outer, wall, innerBottom } = PROFILES[shape];
  const outline = new THREE.SplineCurve(outer).getPoints(72);
  const top = outline[outline.length - 1]!;

  const inner = outline
    .filter((p) => p.y >= innerBottom && p.y < top.y)
    .reverse()
    .map((p) => v(Math.max(p.x - wall, 0.01), p.y));

  const points = [
    v(0, 0),
    ...outline,
    v(top.x - wall * 0.5, top.y + wall * 0.25),
    v(top.x - wall, top.y),
    ...inner,
    v(0, innerBottom),
  ].map((p) => v(p.x, Math.max(p.y, 0)));

  const geometry = new THREE.LatheGeometry(points, 96);
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  geometry.computeBoundingBox();
  return geometry;
}

function buildPedestalGeometry(): THREE.LatheGeometry {
  const radius = 1.25;
  const height = 0.2;
  const bevel = 0.05;
  const points: THREE.Vector2[] = [v(0, -height)];
  // Rounded outer edge: a quarter circle at the bottom and one at the top.
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    points.push(v(radius - bevel + Math.cos(a) * bevel, -height + bevel + Math.sin(a) * bevel));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    points.push(v(radius - bevel + Math.cos(a) * bevel, -bevel + Math.sin(a) * bevel));
  }
  points.push(v(0, 0));
  return new THREE.LatheGeometry(points, 128);
}

function createMaterials(): Record<FinishId, ProductMaterial> {
  const side = THREE.DoubleSide;
  return {
    matte: new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side }),
    gloss: new THREE.MeshPhysicalMaterial({ roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05, side }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 1, side }),
    glass: new THREE.MeshPhysicalMaterial({
      roughness: 0.06,
      transmission: 1,
      thickness: 0.4,
      ior: 1.45,
      attenuationDistance: 2.2,
      side,
    }),
  };
}

function applyColor(material: ProductMaterial, color: THREE.Color): void {
  if (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) {
    // Tinted glass: keep the surface light so dark colors still read as glass.
    material.color.copy(color).lerp(WHITE, 0.45);
    material.attenuationColor.copy(color);
  } else {
    material.color.copy(color);
  }
}

export function isWebGLAvailable(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

export function createStage(container: HTMLElement, options: StageOptions): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.9;
  room.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(3.6, 2.9, 4.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 2.4;
  controls.maxDistance = 8;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  // The product is rotationally symmetric, so the camera orbits to show reflections moving.
  controls.autoRotateSpeed = DEFAULT_RPM;
  let interacted = false;
  controls.addEventListener('start', () => {
    if (interacted) return;
    interacted = true;
    options.onFirstInteraction?.();
  });

  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-2.5, 5, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 12 });
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const pedestalMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const pedestal = new THREE.Mesh(buildPedestalGeometry(), pedestalMaterial);
  pedestal.receiveShadow = true;
  pedestal.castShadow = true;
  scene.add(pedestal);

  const floorMaterial = new THREE.ShadowMaterial({ opacity: SCENE_COLORS.light.shadow });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  scene.add(floor);

  const materials = createMaterials();
  const geometries = new Map<ShapeId, THREE.LatheGeometry>();
  const geometryFor = (shape: ShapeId) => {
    let geometry = geometries.get(shape);
    if (!geometry) {
      geometry = buildProductGeometry(shape);
      geometries.set(shape, geometry);
    }
    return geometry;
  };

  const product = new THREE.Mesh<THREE.BufferGeometry, ProductMaterial>(geometryFor('vase'), materials.matte);
  product.castShadow = true;
  product.receiveShadow = true;
  scene.add(product);

  let config: Config | null = null;
  let targetY = 0;
  let popStart = -1;
  let lastTime = 0;
  let dirty = true;
  const currentColor = new THREE.Color();
  const targetColor = new THREE.Color();

  function resize(): void {
    const { clientWidth: width, clientHeight: height } = container;
    if (width === 0 || height === 0) return;
    const aspect = width / height;
    // On narrow screens widen the vertical FOV so the pedestal still fits horizontally.
    const halfTan = Math.tan(BASE_HALF_FOV) * Math.max(FRAMING_ASPECT / aspect, 1);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfTan));
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    dirty = true;
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function tick(time: number): void {
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    let animating = false;

    if (!currentColor.equals(targetColor)) {
      const k = options.reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
      currentColor.lerp(targetColor, k);
      const distance =
        Math.abs(currentColor.r - targetColor.r) + Math.abs(currentColor.g - targetColor.g) + Math.abs(currentColor.b - targetColor.b);
      if (distance < 0.002) currentColor.copy(targetColor);
      applyColor(product.material, currentColor);
      animating = true;
    }

    const dy = targetY - controls.target.y;
    if (Math.abs(dy) > 0.0005) {
      controls.target.y += options.reducedMotion ? dy : dy * (1 - Math.exp(-dt * 6));
      animating = true;
    }

    if (popStart >= 0) {
      const t = Math.min((time - popStart) / 420, 1);
      product.scale.setScalar(0.94 + 0.06 * (1 - Math.pow(1 - t, 3)));
      if (t >= 1) popStart = -1;
      animating = true;
    }

    const moved = controls.update(dt);
    if (moved || animating || dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }
  }
  renderer.setAnimationLoop(tick);

  return {
    setConfig(next) {
      const first = config === null;
      if (first || next.shape !== config!.shape) {
        product.geometry = geometryFor(next.shape);
        targetY = product.geometry.boundingBox!.max.y / 2;
        if (first) {
          controls.target.set(0, targetY, 0);
        } else if (!options.reducedMotion) {
          popStart = performance.now();
        }
      }
      product.material = materials[next.finish];
      targetColor.set(getColor(next.color).hex);
      if (first) currentColor.copy(targetColor);
      applyColor(product.material, currentColor);
      config = { ...next };
      dirty = true;
    },
    setAutoRotate(enabled) {
      controls.autoRotate = enabled;
      dirty = true;
    },
    setSpeed(rpm) {
      controls.autoRotateSpeed = rpm;
    },
    setWireframe(enabled) {
      for (const material of Object.values(materials)) material.wireframe = enabled;
      dirty = true;
    },
    setTheme(theme) {
      const background = getComputedStyle(container).getPropertyValue('--stage-bg').trim();
      scene.background = new THREE.Color(background || (theme === 'dark' ? '#15181d' : '#e8eaee'));
      pedestalMaterial.color.setHex(SCENE_COLORS[theme].pedestal);
      floorMaterial.opacity = SCENE_COLORS[theme].shadow;
      dirty = true;
    },
    snapshot() {
      renderer.render(scene, camera);
      return new Promise((resolve) => renderer.domElement.toBlob(resolve, 'image/png'));
    },
  };
}
