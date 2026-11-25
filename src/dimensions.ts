import * as THREE from 'three';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MAX_MODULES = 6;

/** World-space measurements of the product, refreshed by the stage before each overlay update. */
export interface DimensionFrame {
  baseY: number;
  topY: number;
  maxR: number;
  heightCm: number;
  diameterCm: number;
  modules: { label: string; y: number; r: number }[];
  moduleCount: number;
}

export function createDimensionFrame(): DimensionFrame {
  return {
    baseY: 0,
    topY: 1,
    maxR: 0.5,
    heightCm: 0,
    diameterCm: 0,
    modules: Array.from({ length: MAX_MODULES }, () => ({ label: '', y: 0, r: 0 })),
    moduleCount: 0,
  };
}

const right = new THREE.Vector3();
const p = new THREE.Vector3();
const a = new THREE.Vector2();
const b = new THREE.Vector2();
const r1 = (n: number) => Math.round(n * 10) / 10;
const LABEL_GAP = 30;
const dotX = new Float32Array(MAX_MODULES);
const dotY = new Float32Array(MAX_MODULES);
const labelY = new Float32Array(MAX_MODULES);

/** Dimension lines and module hotspots drawn in a DOM layer over the canvas. */
export class DimensionsOverlay {
  readonly root: HTMLDivElement;
  private readonly path: SVGPathElement;
  private readonly leaders: SVGPathElement;
  private readonly dots: SVGCircleElement[] = [];
  private readonly height: HTMLDivElement;
  private readonly width: HTMLDivElement;
  private readonly moduleLabels: HTMLDivElement[] = [];
  private readonly texts = new Map<HTMLElement, string>();
  private visible = false;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'dims';
    this.root.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'dims-svg');
    this.path = document.createElementNS(SVG_NS, 'path');
    this.path.setAttribute('class', 'dims-line');
    this.leaders = document.createElementNS(SVG_NS, 'path');
    this.leaders.setAttribute('class', 'dims-leader');
    svg.append(this.path, this.leaders);
    for (let i = 0; i < MAX_MODULES; i++) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('r', '4');
      dot.setAttribute('class', 'dims-dot');
      svg.append(dot);
      this.dots.push(dot);
    }
    this.height = this.label('dims-label dims-measure');
    this.width = this.label('dims-label dims-measure');
    for (let i = 0; i < MAX_MODULES; i++) this.moduleLabels.push(this.label('dims-label dims-module'));
    this.root.prepend(svg);
    container.append(this.root);
  }

  private label(className: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = className;
    this.root.append(el);
    return el;
  }

  private setText(el: HTMLElement, html: string): void {
    if (this.texts.get(el) === html) return;
    this.texts.set(el, html);
    el.innerHTML = html;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.classList.toggle('is-visible', visible);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Projects world point (x, y, z) to CSS pixels in `out`. */
  private project(camera: THREE.Camera, x: number, y: number, z: number, w: number, h: number, out: THREE.Vector2): THREE.Vector2 {
    p.set(x, y, z).project(camera);
    return out.set(((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h);
  }

  update(camera: THREE.PerspectiveCamera, frame: DimensionFrame, w: number, h: number): void {
    if (!this.visible) return;
    // Screen-right direction on the ground plane, so lines stay beside the silhouette while orbiting.
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    right.y = 0;
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();

    const gap = frame.maxR + 0.2;
    let d = '';
    // Height: vertical line right of the product with end ticks.
    this.project(camera, right.x * gap, frame.baseY, right.z * gap, w, h, a);
    this.project(camera, right.x * gap, frame.topY, right.z * gap, w, h, b);
    d += `M${r1(a.x)} ${r1(a.y)}L${r1(b.x)} ${r1(b.y)}M${r1(a.x - 7)} ${r1(a.y)}h14M${r1(b.x - 7)} ${r1(b.y)}h14`;
    this.place(this.height, (a.x + b.x) / 2 + 14, (a.y + b.y) / 2, 'left');
    this.setText(this.height, `<b>${Math.round(frame.heightCm)} cm</b><span>wysokość</span>`);

    // Diameter: horizontal line above the product.
    const y = frame.topY + 0.16;
    this.project(camera, -right.x * frame.maxR, y, -right.z * frame.maxR, w, h, a);
    this.project(camera, right.x * frame.maxR, y, right.z * frame.maxR, w, h, b);
    d += `M${r1(a.x)} ${r1(a.y)}L${r1(b.x)} ${r1(b.y)}M${r1(a.x)} ${r1(a.y - 7)}v14M${r1(b.x)} ${r1(b.y - 7)}v14`;
    this.place(this.width, (a.x + b.x) / 2, Math.min(a.y, b.y) - 10, 'top');
    this.setText(this.width, `<b>Ø ${Math.round(frame.diameterCm)} cm</b><span>średnica</span>`);
    this.path.setAttribute('d', d);

    // Modules: dots on the left silhouette, leaders to a label column. Modules come top to bottom.
    let column = Infinity;
    for (let i = 0; i < frame.moduleCount; i++) {
      const m = frame.modules[i]!;
      this.project(camera, -right.x * m.r, m.y, -right.z * m.r, w, h, a);
      dotX[i] = a.x;
      dotY[i] = a.y;
      column = Math.min(column, a.x - 44);
    }
    // Push labels apart so they never overlap; leaders bend to reach them.
    let lastY = -Infinity;
    for (let i = 0; i < frame.moduleCount; i++) {
      labelY[i] = Math.max(dotY[i]!, lastY + LABEL_GAP);
      lastY = labelY[i]!;
    }
    let leaders = '';
    for (let i = 0; i < MAX_MODULES; i++) {
      const dot = this.dots[i]!;
      const label = this.moduleLabels[i]!;
      if (i >= frame.moduleCount) {
        dot.style.display = 'none';
        label.style.display = 'none';
        continue;
      }
      const m = frame.modules[i]!;
      const x = dotX[i]!;
      const y = dotY[i]!;
      const ly = labelY[i]!;
      dot.style.display = '';
      label.style.display = '';
      dot.setAttribute('cx', String(r1(x)));
      dot.setAttribute('cy', String(r1(y)));
      leaders += `M${r1(x - 5)} ${r1(y)}H${r1(column + 16)}L${r1(column)} ${r1(ly)}`;
      this.place(label, column - 6, ly, 'right');
      this.setText(label, m.label);
    }
    this.leaders.setAttribute('d', leaders);
  }

  private place(el: HTMLElement, x: number, y: number, anchor: 'left' | 'right' | 'top'): void {
    const shift = anchor === 'left' ? 'translate(0,-50%)' : anchor === 'right' ? 'translate(-100%,-50%)' : 'translate(-50%,-100%)';
    el.style.transform = `translate3d(${r1(x)}px,${r1(y)}px,0) ${shift}`;
  }
}
