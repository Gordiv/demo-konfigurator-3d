import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getColor, getSize, type Config, type EnvironmentId, type FinishId, type ShapeId, type Theme } from './config';
import { AdaptivePixelRatio } from './quality';
import { CM_PER_UNIT, PROFILE_POINTS, SHAPE_MODULES, buildProfile, lerpProfile, profileMetrics, radiusAt } from './profile';
import { buildEnvironmentScene, disposeScene, getEnvironment, ENVIRONMENTS } from './environments';
import { Tween, damp, easeInOutCubic, lerp, lerpAngle } from './motion';
import { DimensionsOverlay, MAX_MODULES, createDimensionFrame } from './dimensions';
import { LatheSurface } from './lathe';
import type { CameraView } from './shortcuts';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ExportOptions {
  width: number;
  height: number;
  /** Paints the backdrop under the render; null keeps the PNG transparent. */
  background: ((ctx: CanvasRenderingContext2D, width: number, height: number) => void) | null;
}

export interface Stage {
  setConfig(config: Config): void;
  setEnvironment(id: EnvironmentId): void;
  setTheme(theme: Theme): void;
  setView(view: CameraView): void;
  setAutoRotate(enabled: boolean): void;
  setDimensions(enabled: boolean): void;
  setInsets(insets: Insets): void;
  exportImage(options: ExportOptions): Promise<Blob | null>;
  thumbnail(width: number, height: number, background: ExportOptions['background']): string;
  maxExportSize(): number;
  pixelRatio(): number;
  /** Average ms per frame over `frames` synchronous renders (diagnostics). */
  measure(frames: number, pixelRatio?: number): number;
}

interface StageOptions {
  reducedMotion: boolean;
  software: boolean;
  onViewChange?: (view: CameraView | null) => void;
  onFirstInteraction?: () => void;
  onReady?: () => void;
}

interface FinishParams {
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  envBoost: number;
}

/** Clearcoat never reaches 0 so its shader variant never toggles mid-animation. */
const FINISH_PARAMS: Record<FinishId, FinishParams> = {
  matte: { roughness: 0.7, metalness: 0, clearcoat: 0.02, clearcoatRoughness: 0.9, transmission: 0, envBoost: 0.9 },
  gloss: { roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, transmission: 0, envBoost: 1 },
  metal: { roughness: 0.26, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.14, transmission: 0, envBoost: 1.1 },
  glass: { roughness: 0.04, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.03, transmission: 1, envBoost: 1.15 },
};

const SCENE_THEME: Record<Theme, { pedestal: string; contact: number; ground: number }> = {
  light: { pedestal: '#c2beb7', contact: 0.62, ground: 0.26 },
  dark: { pedestal: '#1c1f28', contact: 0.85, ground: 0.5 },
};

interface CameraPose {
  az: number;
  polar: number;
  dist: number;
  targetY: number;
}

const VIEWS: Record<CameraView, { az: number; polar: number; distance: number; target: number }> = {
  hero: { az: 0.62, polar: 1.16, distance: 1, target: 0.46 },
  front: { az: 0, polar: 1.47, distance: 1, target: 0.5 },
  top: { az: 0.3, polar: 0.2, distance: 0.92, target: 0.2 },
  detail: { az: 0.38, polar: 1.12, distance: 0.56, target: 0.84 },
};

const FOV = 30;
const PEDESTAL_RADIUS = 1.25;
const PEDESTAL_HEIGHT = 0.2;
const STAND_HEIGHT = 0.09;
const WHITE = new THREE.Color(0xffffff);
const MORPH_MS = 820;

export interface WebGLSupport {
  available: boolean;
  software: boolean;
}

export function detectWebGL(): WebGLSupport {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return { available: false, software: false };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { available: true, software: /swiftshader|llvmpipe|software|basic render/i.test(name) };
  } catch {
    return { available: false, software: false };
  }
}

function latheGeometry(points: [number, number][], segments: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

function pedestalGeometry(): THREE.LatheGeometry {
  const r = PEDESTAL_RADIUS;
  const h = PEDESTAL_HEIGHT;
  const bevel = 0.045;
  const pts: [number, number][] = [[0, -h]];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push([r - 0.06 - bevel + Math.cos(a) * bevel, -h + bevel + Math.sin(a) * bevel]);
  }
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push([r - bevel + Math.cos(a) * bevel, -bevel + Math.sin(a) * bevel]);
  }
  pts.push([0, 0]);
  return latheGeometry(pts, 128);
}

/** Unit-size stand (radius 1, height 1) with rounded edges; scaled per product. */
function standGeometry(): THREE.LatheGeometry {
  const pts: [number, number][] = [[0, 0]];
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * (Math.PI / 2);
    pts.push([0.92 + Math.cos(a) * 0.08, 0.3 + Math.sin(a) * 0.3]);
  }
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push([0.92 + Math.cos(a) * 0.08, 0.7 + Math.sin(a) * 0.3]);
  }
  pts.push([0, 1]);
  return latheGeometry(pts, 96);
}

function softShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.65, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function shadowDisc(texture: THREE.Texture, opacity: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity, toneMapped: false, color: 0x000000 });
  material.color.setRGB(1, 1, 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

export function createStage(container: HTMLElement, options: StageOptions): Stage {
  const { reducedMotion, software } = options;
  // Software rasterizers pay per pixel (about 10x between ratio 1 and 0.5), so they start at the floor.
  const maxRatio = software ? 0.5 : Math.min(window.devicePixelRatio || 1, 2);
  const quality = new AdaptivePixelRatio(maxRatio, 0.5);
  const renderer = new THREE.WebGLRenderer({ antialias: !software, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(quality.current);
  renderer.toneMapping = THREE.NeutralToneMapping;
  // Glass refracts a blurred copy of the scene, so half resolution is enough for it.
  renderer.transmissionResolutionScale = 0.5;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Lights and objects stay still while the camera orbits: redraw shadows only when the product changes.
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMaps = new Map<EnvironmentId, THREE.Texture>();
  const envMap = (id: EnvironmentId): THREE.Texture => {
    let texture = envMaps.get(id);
    if (!texture) {
      const envScene = buildEnvironmentScene(id);
      texture = pmrem.fromScene(envScene, 0.035).texture;
      disposeScene(envScene);
      envMaps.set(id, texture);
    }
    return texture;
  };

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.enablePan = false;
  controls.minDistance = 1.3;
  controls.maxDistance = 14;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.5;
  controls.rotateSpeed = 0.8;
  controls.autoRotateSpeed = 2.4;

  // Lights
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(software ? 512 : 1024);
  Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.6, bottom: -1.2, near: 0.5, far: 20 });
  key.shadow.radius = software ? 3 : 7;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.025;
  scene.add(key, key.target);
  const rims = [new THREE.DirectionalLight(0xffffff, 0), new THREE.DirectionalLight(0xffffff, 0)] as const;
  scene.add(...rims);

  // Pedestal and soft ground shadows
  const shadowTexture = softShadowTexture();
  const pedestalMaterial = software
    ? new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0 })
    : new THREE.MeshPhysicalMaterial({ roughness: 0.48, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const pedestal = new THREE.Mesh(pedestalGeometry(), pedestalMaterial);
  pedestal.receiveShadow = true;
  scene.add(pedestal);
  const ground = shadowDisc(shadowTexture, 0.4);
  ground.position.y = -PEDESTAL_HEIGHT - 0.002;
  ground.scale.setScalar(PEDESTAL_RADIUS * 1.65);
  scene.add(ground);
  const contact = shadowDisc(shadowTexture, 0.8);
  contact.position.y = 0.003;
  scene.add(contact);

  // Product
  const root = new THREE.Group();
  scene.add(root);
  const surface = new LatheSurface(PROFILE_POINTS, software ? 72 : 120);
  const material = new THREE.MeshPhysicalMaterial({ thickness: 0.35, ior: 1.5, attenuationDistance: 2.4, specularIntensity: 1 });
  const product = new THREE.Mesh(surface.geometry, material);
  product.castShadow = true;
  product.receiveShadow = true;
  root.add(product);

  const standMaterial = new THREE.MeshPhysicalMaterial({ color: '#b07a4a', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const stand = new THREE.Mesh(standGeometry(), standMaterial);
  stand.castShadow = true;
  stand.receiveShadow = true;
  stand.visible = false;
  scene.add(stand);

  const dims = new DimensionsOverlay(container);
  const dimFrame = createDimensionFrame();

  // State
  const profiles = new Map<ShapeId, Float32Array>();
  const profileOf = (shape: ShapeId) => {
    let profile = profiles.get(shape);
    if (!profile) {
      profile = buildProfile(shape);
      profiles.set(shape, profile);
    }
    return profile;
  };
  const fromProfile = new Float32Array(PROFILE_POINTS * 2);
  let toProfile: Float32Array = fromProfile;
  const currentProfile = new Float32Array(PROFILE_POINTS * 2);
  const metrics = profileMetrics(currentProfile);
  const targetMetrics = profileMetrics(currentProfile);
  const morph = new Tween(1, easeInOutCubic);

  let config: Config | null = null;
  let theme: Theme = 'dark';
  let envId: EnvironmentId = 'studio';
  let pendingEnv: EnvironmentId | null = null;
  const envFade = new Tween(1, easeInOutCubic);

  const finishFrom: FinishParams = { ...FINISH_PARAMS.matte };
  const finishTo: FinishParams = { ...FINISH_PARAMS.matte };
  const finishNow: FinishParams = { ...FINISH_PARAMS.matte };
  const finishT = new Tween(1, easeInOutCubic);
  const currentColor = new THREE.Color();
  const targetColor = new THREE.Color();
  const pedestalTarget = new THREE.Color();
  const scale = new Tween(1, easeInOutCubic);
  const standGrow = new Tween(0, easeInOutCubic);
  const standRadius = new Tween(0.5, easeInOutCubic);

  // Light transition between environments
  interface LightState {
    color: THREE.Color;
    intensity: number;
    position: THREE.Vector3;
  }
  const lightState = (): LightState => ({ color: new THREE.Color(), intensity: 0, position: new THREE.Vector3() });
  const lightFrom = [lightState(), lightState(), lightState()];
  const lightTo = [lightState(), lightState(), lightState()];
  const lightT = new Tween(1, easeInOutCubic);
  let exposureFrom = 1;
  let exposureTo = 1;
  let shadowFrom = 0.55;
  let shadowTo = 0.55;
  const lights = [key, rims[0], rims[1]];

  const cameraTween = { active: false, start: 0, duration: 0, from: { az: 0, polar: 0, dist: 0, targetY: 0 }, to: { az: 0, polar: 0, dist: 0, targetY: 0 } };
  let activeView: CameraView | null = 'hero';
  let interacted = false;
  let dragging = false;

  const insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  let width = 1;
  let height = 1;
  let fullHeight = 1;
  let availWidth = 1;
  let availHeight = 1;

  let raf = 0;
  let lastTime = 0;
  let lastRenderTime = 0;
  let dirty = true;
  let shadowDirty = true;
  let ready = false;

  const offset = new THREE.Vector3();
  const spherical = new THREE.Spherical();

  function invalidate(): void {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function currentPose(out: CameraPose): CameraPose {
    offset.copy(camera.position).sub(controls.target);
    spherical.setFromVector3(offset);
    out.az = spherical.theta;
    out.polar = spherical.phi;
    out.dist = spherical.radius;
    out.targetY = controls.target.y;
    return out;
  }

  function applyPose(pose: CameraPose): void {
    controls.target.set(0, pose.targetY, 0);
    spherical.set(pose.dist, pose.polar, pose.az);
    camera.position.setFromSpherical(spherical).add(controls.target);
  }

  /** Height of the framed object (product plus stand) for the target configuration. */
  function framedHeight(): number {
    const size = config ? getSize(config.size).scale : 1;
    const standOn = config?.extras.includes('stand') ? STAND_HEIGHT : 0;
    return targetMetrics.height * size + standOn;
  }

  /**
   * Distance at which product and pedestal fit the free part of the viewport when seen from `polar`.
   * The scene is treated as a cylinder (pedestal radius, pedestal bottom to product top), projected orthographically,
   * then padded for perspective.
   */
  function fitDistance(polar: number): number {
    const size = config ? getSize(config.size).scale : 1;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const radius = Math.max(PEDESTAL_RADIUS, targetMetrics.maxRadius * size + 0.1);
    const tall = framedHeight() + PEDESTAL_HEIGHT;
    const vertical = tall * Math.sin(polar) + 2 * radius * Math.abs(Math.cos(polar));
    const horizontal = 2 * radius;
    const byHeight = (vertical * fullHeight) / (2 * tanHalf * availHeight);
    const byWidth = (horizontal * fullHeight) / (2 * tanHalf * availWidth);
    // Near parts of the pedestal look larger in perspective; the margin keeps them clear of the edges.
    return Math.max(byHeight, byWidth) * 1.14 + radius * 0.35;
  }

  function viewPose(view: CameraView, keepAngles: boolean, out: CameraPose): CameraPose {
    const spec = VIEWS[view];
    if (keepAngles) {
      currentPose(out);
    } else {
      out.az = spec.az;
      out.polar = spec.polar;
    }
    out.dist = THREE.MathUtils.clamp(fitDistance(out.polar) * spec.distance, controls.minDistance, controls.maxDistance);
    out.targetY = framedHeight() * spec.target;
    return out;
  }

  function moveCamera(to: CameraPose, duration: number): void {
    if (reducedMotion || duration <= 0) {
      cameraTween.active = false;
      applyPose(to);
      dirty = true;
      invalidate();
      return;
    }
    currentPose(cameraTween.from);
    Object.assign(cameraTween.to, to);
    cameraTween.start = performance.now();
    cameraTween.duration = duration;
    cameraTween.active = true;
    invalidate();
  }

  const scratchPose: CameraPose = { az: 0, polar: 0, dist: 0, targetY: 0 };
  function stepCamera(time: number): boolean {
    if (!cameraTween.active) return false;
    const t = Math.min((time - cameraTween.start) / cameraTween.duration, 1);
    const e = easeInOutCubic(t);
    const { from, to } = cameraTween;
    scratchPose.az = lerpAngle(from.az, to.az, e);
    scratchPose.polar = lerp(from.polar, to.polar, e);
    scratchPose.dist = lerp(from.dist, to.dist, e);
    scratchPose.targetY = lerp(from.targetY, to.targetY, e);
    applyPose(scratchPose);
    if (t >= 1) cameraTween.active = false;
    return true;
  }

  controls.addEventListener('start', () => {
    dragging = true;
    cameraTween.active = false;
    if (activeView !== null) {
      activeView = null;
      options.onViewChange?.(null);
    }
    if (!interacted) {
      interacted = true;
      options.onFirstInteraction?.();
    }
    invalidate();
  });
  controls.addEventListener('end', () => {
    dragging = false;
    invalidate();
  });
  // OrbitControls applies wheel zoom synchronously, so the next frame sees no movement: force a redraw.
  controls.addEventListener('change', () => {
    dirty = true;
    invalidate();
  });

  function applyLayout(): void {
    const sx = width / 2 - (insets.left + (width - insets.right)) / 2;
    const sy = height / 2 - (insets.top + (height - insets.bottom)) / 2;
    const fullWidth = width + 2 * Math.abs(sx);
    fullHeight = height + 2 * Math.abs(sy);
    availWidth = Math.max(width - insets.left - insets.right, width * 0.3);
    availHeight = Math.max(height - insets.top - insets.bottom, height * 0.3);
    camera.aspect = fullWidth / fullHeight;
    camera.setViewOffset(fullWidth, fullHeight, sx > 0 ? 2 * sx : 0, sy > 0 ? 2 * sy : 0, width, height);
    camera.updateProjectionMatrix();
  }

  function resize(): void {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    width = clientWidth;
    height = clientHeight;
    renderer.setSize(width, height, false);
    applyLayout();
    if (config && activeView && !cameraTween.active) applyPose(viewPose(activeView, true, scratchPose));
    dirty = true;
    invalidate();
  }

  function applyFinish(): void {
    const p = finishNow;
    material.roughness = p.roughness;
    material.metalness = p.metalness;
    material.clearcoat = p.clearcoat;
    material.clearcoatRoughness = p.clearcoatRoughness;
    material.transmission = p.transmission < 0.002 ? 0 : p.transmission;
    material.envMapIntensity = p.envBoost;
    // Tinted glass keeps a light surface so dark colors still read as glass.
    material.color.copy(currentColor).lerp(WHITE, 0.5 * p.transmission);
    material.attenuationColor.copy(currentColor);
    key.shadow.intensity = lerp(shadowFrom, shadowTo, lightT.value) * (1 - 0.5 * p.transmission);
    contact.material.opacity = SCENE_THEME[theme].contact * (1 - 0.6 * p.transmission);
  }

  function snapshotLights(): void {
    lights.forEach((light, i) => {
      lightFrom[i]!.color.copy(light.color);
      lightFrom[i]!.intensity = light.intensity;
      lightFrom[i]!.position.copy(light.position);
    });
    exposureFrom = renderer.toneMappingExposure;
    shadowFrom = key.shadow.intensity;
  }

  function targetLights(id: EnvironmentId): void {
    const env = getEnvironment(id);
    const specs = [env.key, env.rims[0], env.rims[1]];
    specs.forEach((spec, i) => {
      lightTo[i]!.color.set(spec.color);
      lightTo[i]!.intensity = spec.intensity;
      lightTo[i]!.position.set(...spec.position);
    });
    exposureTo = env.exposure;
    shadowTo = env.shadowOpacity;
  }

  function stepLights(): void {
    const t = lightT.value;
    lights.forEach((light, i) => {
      light.color.copy(lightFrom[i]!.color).lerp(lightTo[i]!.color, t);
      light.intensity = lerp(lightFrom[i]!.intensity, lightTo[i]!.intensity, t);
      light.position.copy(lightFrom[i]!.position).lerp(lightTo[i]!.position, t);
    });
    renderer.toneMappingExposure = lerp(exposureFrom, exposureTo, t);
    key.shadow.intensity = lerp(shadowFrom, shadowTo, t) * (1 - 0.5 * finishNow.transmission);
  }

  function updateTransforms(): void {
    const s = scale.value;
    const grow = standGrow.value;
    root.scale.setScalar(s);
    root.position.y = STAND_HEIGHT * grow;
    stand.visible = grow > 0.002;
    const r = standRadius.value * s;
    stand.scale.set(r, STAND_HEIGHT * grow, r);
    contact.scale.setScalar(Math.max(metrics.baseRadius * s * 1.9, 0.2));
    contact.position.y = 0.003 + STAND_HEIGHT * grow;
  }

  function updateDimensions(): void {
    if (!config) return;
    const s = scale.value;
    dimFrame.baseY = root.position.y;
    dimFrame.topY = root.position.y + metrics.height * s;
    dimFrame.maxR = metrics.maxRadius * s;
    dimFrame.heightCm = metrics.height * s * CM_PER_UNIT;
    dimFrame.diameterCm = metrics.maxRadius * 2 * s * CM_PER_UNIT;
    const modules = SHAPE_MODULES[config.shape];
    let count = 0;
    for (const m of modules) {
      if (count >= MAX_MODULES) break;
      const slot = dimFrame.modules[count++]!;
      const y = m.at * metrics.height;
      slot.label = m.label;
      slot.y = root.position.y + y * s;
      slot.r = radiusAt(currentProfile, y) * s;
    }
    if (stand.visible && count < MAX_MODULES) {
      const slot = dimFrame.modules[count++]!;
      slot.label = 'Podstawka';
      slot.y = (STAND_HEIGHT * standGrow.value) / 2;
      slot.r = standRadius.value * s;
    }
    dimFrame.moduleCount = count;
    dims.update(camera, dimFrame, width, height);
  }

  /**
   * One hidden draw with every optional part enabled, while the canvas is still transparent.
   * Some drivers (ANGLE on D3D11) finish shader variants only at the first real draw into each target,
   * which would otherwise stall the first switch to glass by a few hundred milliseconds.
   */
  function warmUp(): void {
    const standVisible = stand.visible;
    material.transmission = 1;
    stand.visible = true;
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    stand.visible = standVisible;
    applyFinish();
    shadowDirty = true;
  }

  function render(time: number): void {
    if (lastRenderTime) {
      const ratio = quality.sample(time - lastRenderTime);
      if (ratio !== null) {
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
      }
    }
    lastRenderTime = time;
    if (!ready) warmUp();
    if (shadowDirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowDirty = false;
    }
    renderer.render(scene, camera);
    updateDimensions();
    dirty = false;
    if (!ready) {
      ready = true;
      options.onReady?.();
    }
  }

  function frame(time: number): void {
    raf = 0;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 1 / 20) : 1 / 60;
    lastTime = time;
    let animating = false;

    if (morph.active) {
      morph.update(time);
      lerpProfile(currentProfile, fromProfile, toProfile, morph.value);
      surface.update(currentProfile);
      profileMetrics(currentProfile, metrics);
      shadowDirty = true;
      animating = true;
    }

    const colorMoving = !currentColor.equals(targetColor);
    if (colorMoving) {
      currentColor.lerp(targetColor, reducedMotion ? 1 : damp(8, dt));
      const d = Math.abs(currentColor.r - targetColor.r) + Math.abs(currentColor.g - targetColor.g) + Math.abs(currentColor.b - targetColor.b);
      if (d < 0.002) currentColor.copy(targetColor);
      animating = true;
    }
    if (finishT.active) {
      finishT.update(time);
      const t = finishT.value;
      for (const k of Object.keys(finishNow) as (keyof FinishParams)[]) finishNow[k] = lerp(finishFrom[k], finishTo[k], t);
      animating = true;
    }
    if (colorMoving || animating) applyFinish();

    if (!pedestalMaterial.color.equals(pedestalTarget)) {
      pedestalMaterial.color.lerp(pedestalTarget, reducedMotion ? 1 : damp(7, dt));
      const d = Math.abs(pedestalMaterial.color.r - pedestalTarget.r) + Math.abs(pedestalMaterial.color.g - pedestalTarget.g);
      if (d < 0.002) pedestalMaterial.color.copy(pedestalTarget);
      animating = true;
    }

    const sizing = scale.update(time);
    const growing = standGrow.update(time);
    const radiusing = standRadius.update(time);
    if (sizing || growing || radiusing || morph.active) {
      shadowDirty = true;
      animating = true;
    }
    updateTransforms();

    if (envFade.active || pendingEnv) {
      envFade.update(time);
      if (!envFade.active && pendingEnv) {
        envId = pendingEnv;
        pendingEnv = null;
        scene.environment = envMap(envId);
        envFade.set(1, time, 460);
      }
      scene.environmentIntensity = getEnvironment(pendingEnv ?? envId).envIntensity * envFade.value;
      animating = true;
    }
    if (lightT.active) {
      lightT.update(time);
      stepLights();
      shadowDirty = true;
      animating = true;
    }

    if (stepCamera(time)) animating = true;
    const moved = controls.update(dt);

    if (moved || animating || dirty) render(time);
    else lastRenderTime = 0;

    if (moved || animating || dragging || controls.autoRotate) invalidate();
    else lastTime = 0;
  }

  new ResizeObserver(resize).observe(container);
  resize();

  // Initial environment and lights.
  scene.environment = envMap(envId);
  targetLights(envId);
  lightT.value = 1;
  stepLights();
  pedestalTarget.set(SCENE_THEME[theme].pedestal);
  pedestalMaterial.color.copy(pedestalTarget);


  // Build the remaining environment maps while the page is idle.
  const idle = (cb: () => void): void => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(cb, { timeout: 2500 });
    else setTimeout(cb, 400);
  };
  const warmEnvironments = (index: number) => {
    const next = ENVIRONMENTS[index];
    if (!next) return;
    idle(() => {
      envMap(next.id);
      warmEnvironments(index + 1);
    });
  };
  window.setTimeout(() => warmEnvironments(0), 1200);

  renderer.domElement.addEventListener('webglcontextlost', (event) => event.preventDefault());

  function exportRender(w: number, h: number, background: ExportOptions['background'], hero: boolean): HTMLCanvasElement {
    const savedRatio = renderer.getPixelRatio();
    const savedPose = currentPose({ az: 0, polar: 0, dist: 0, targetY: 0 });
    const dimsVisible = dims.isVisible;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    camera.clearViewOffset();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (hero) {
      const pose = viewPose('hero', false, { az: 0, polar: 0, dist: 0, targetY: 0 });
      // Without the side panel the product is framed tighter.
      pose.dist *= Math.min(1, (availHeight / fullHeight) * 1.05);
      applyPose(pose);
    }
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    background?.(ctx, w, h);
    ctx.drawImage(renderer.domElement, 0, 0, w, h);
    // Restore the live view in the same task, so the swap is never visible.
    renderer.setPixelRatio(savedRatio);
    renderer.setSize(width, height, false);
    applyLayout();
    applyPose(savedPose);
    controls.update(0);
    renderer.render(scene, camera);
    if (dimsVisible) updateDimensions();
    return out;
  }

  const stage: Stage = {
    setConfig(next) {
      const first = config === null;
      const shapeChanged = first || next.shape !== config!.shape;
      const sizeChanged = first || next.size !== config!.size;
      const standChanged = first || next.extras.includes('stand') !== config!.extras.includes('stand');
      const now = performance.now();

      if (shapeChanged) {
        const target = profileOf(next.shape);
        profileMetrics(target, targetMetrics);
        if (first || reducedMotion) {
          currentProfile.set(target);
          fromProfile.set(target);
          toProfile = target;
          morph.set(1, now, 0);
          surface.update(currentProfile);
          profileMetrics(currentProfile, metrics);
        } else {
          fromProfile.set(currentProfile);
          toProfile = target;
          morph.value = 0;
          morph.set(1, now, MORPH_MS);
        }
        standRadius.set(targetMetrics.baseRadius * 1.3 + 0.05, now, first || reducedMotion ? 0 : MORPH_MS);
      }

      const size = getSize(next.size).scale;
      if (sizeChanged) scale.set(size, now, first || reducedMotion ? 0 : 650);
      if (standChanged) standGrow.set(next.extras.includes('stand') ? 1 : 0, now, first || reducedMotion ? 0 : 600);

      if (first || next.finish !== config!.finish) {
        Object.assign(finishFrom, finishNow);
        Object.assign(finishTo, FINISH_PARAMS[next.finish]);
        if (first || reducedMotion) {
          Object.assign(finishNow, finishTo);
          finishT.set(1, now, 0);
        } else {
          finishT.value = 0;
          finishT.set(1, now, 700);
        }
      }
      targetColor.set(getColor(next.color).hex);
      if (first) currentColor.copy(targetColor);

      config = { ...next, extras: [...next.extras] };
      applyFinish();
      updateTransforms();
      shadowDirty = true;
      dirty = true;

      if (first) {
        const pose = viewPose('hero', false, { az: 0, polar: 0, dist: 0, targetY: 0 });
        if (reducedMotion) {
          applyPose(pose);
        } else {
          // Intro: start lower and further away, then glide into the hero view.
          applyPose({ az: pose.az - 0.9, polar: 1.38, dist: pose.dist * 1.35, targetY: pose.targetY });
          moveCamera(pose, 1800);
        }
      } else if (shapeChanged || sizeChanged || standChanged) {
        moveCamera(viewPose(activeView ?? 'hero', activeView === null, { az: 0, polar: 0, dist: 0, targetY: 0 }), MORPH_MS + 100);
      }
      invalidate();
    },
    setEnvironment(id) {
      if (id === (pendingEnv ?? envId)) return;
      const now = performance.now();
      snapshotLights();
      targetLights(id);
      if (reducedMotion || config === null) {
        envId = id;
        pendingEnv = null;
        scene.environment = envMap(id);
        scene.environmentIntensity = getEnvironment(id).envIntensity;
        lightT.value = 1;
        stepLights();
      } else {
        envMap(id);
        pendingEnv = id;
        envFade.set(0.15, now, 260);
        lightT.value = 0;
        lightT.set(1, now, 900);
      }
      shadowDirty = true;
      dirty = true;
      invalidate();
    },
    setTheme(next) {
      theme = next;
      pedestalTarget.set(SCENE_THEME[theme].pedestal);
      ground.material.opacity = SCENE_THEME[theme].ground;
      applyFinish();
      dirty = true;
      invalidate();
    },
    setView(view) {
      activeView = view;
      options.onViewChange?.(view);
      moveCamera(viewPose(view, false, { az: 0, polar: 0, dist: 0, targetY: 0 }), 1100);
    },
    setAutoRotate(enabled) {
      controls.autoRotate = enabled;
      if (enabled && activeView !== null) {
        activeView = null;
        options.onViewChange?.(null);
      }
      invalidate();
    },
    setDimensions(enabled) {
      dims.setVisible(enabled);
      dirty = true;
      invalidate();
    },
    setInsets(next) {
      Object.assign(insets, next);
      applyLayout();
      if (config && activeView && !cameraTween.active) applyPose(viewPose(activeView, true, scratchPose));
      dirty = true;
      invalidate();
    },
    async exportImage({ width: w, height: h, background }) {
      const canvas = exportRender(w, h, background, true);
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    },
    thumbnail(w, h, background) {
      try {
        return exportRender(w, h, background, true).toDataURL('image/jpeg', 0.84);
      } catch {
        return '';
      }
    },
    maxExportSize() {
      const gl = renderer.getContext();
      const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
      return Math.min(renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, viewport[0]!, viewport[1]!);
    },
    pixelRatio() {
      return renderer.getPixelRatio();
    },
    measure(frames, pixelRatio) {
      // Renders through the normal path, waiting for the GPU after each frame.
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const savedRatio = renderer.getPixelRatio();
      if (pixelRatio) {
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      }
      const start = performance.now();
      for (let i = 0; i < frames; i++) {
        renderer.shadowMap.needsUpdate = true;
        renderer.render(scene, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      }
      const ms = (performance.now() - start) / frames;
      renderer.setPixelRatio(savedRatio);
      renderer.setSize(width, height, false);
      lastRenderTime = 0;
      return ms;
    },
  };
  return stage;
}
