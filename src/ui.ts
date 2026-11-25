import {
  COLORS,
  EXTRAS,
  FINISHES,
  SHAPES,
  SIZES,
  formatDelta,
  formatPrice,
  getColor,
  getFinish,
  getShape,
  getSize,
  priceBreakdown,
  productName,
  toggleExtra,
  type Config,
  type EnvironmentId,
  type ShapeId,
  type Theme,
} from './config';
import { ENVIRONMENTS } from './environments';
import { CM_PER_UNIT, OUTER_POINTS, OUTER_START, buildProfile, profileMetrics } from './profile';
import { easeOutExpo } from './motion';
import type { CameraView } from './shortcuts';
import { icon } from './icons';

export interface ViewState {
  theme: Theme;
  env: EnvironmentId;
  view: CameraView | null;
  presentation: boolean;
  dimensions: boolean;
}

export interface UIHandlers {
  onConfig(next: Config): void;
  onView(patch: Partial<ViewState>): void;
  onUndo(): void;
  onRedo(): void;
  onSave(): void;
  onExport(): void;
  onShare(): void;
  onOpenSaved(): void;
  onHelp(): void;
}

export interface UI {
  render(config: Config, view: ViewState, history: { canUndo: boolean; canRedo: boolean }): void;
  setSavedCount(count: number, bump?: boolean): void;
  toast(message: string): void;
  announce(message: string): void;
  layoutIndicators(): void;
}

export const VIEW_LABELS: Record<CameraView, string> = { hero: '3/4', front: 'Przód', top: 'Góra', detail: 'Detal' };
const VIEW_ORDER: CameraView[] = ['hero', 'front', 'top', 'detail'];

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function button(className: string, html: string, onClick: () => void, pressed = true): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.innerHTML = html;
  if (pressed) el.setAttribute('aria-pressed', 'false');
  el.addEventListener('click', onClick);
  return el;
}

const setPressed = (el: HTMLElement, pressed: boolean) => {
  const value = String(pressed);
  if (el.getAttribute('aria-pressed') !== value) el.setAttribute('aria-pressed', value);
};

const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};

/** Height (cm) and diameter (cm) of each shape at size M. */
const SHAPE_DIMS = new Map<ShapeId, { height: number; diameter: number }>();
const SHAPE_ICONS = new Map<ShapeId, string>();
for (const shape of SHAPES) {
  const profile = buildProfile(shape.id);
  const m = profileMetrics(profile);
  SHAPE_DIMS.set(shape.id, { height: m.height * CM_PER_UNIT, diameter: m.maxRadius * 2 * CM_PER_UNIT });
  // Silhouette icon drawn from the real profile, on a scale shared by all shapes.
  const s = 21 / 1.95;
  const base = 22.5;
  const right: string[] = [];
  const left: string[] = [];
  for (let i = OUTER_START; i < OUTER_START + OUTER_POINTS; i += 3) {
    const x = profile[i * 2]! * s;
    const y = base - profile[i * 2 + 1]! * s;
    right.push(`${(12 + x).toFixed(2)} ${y.toFixed(2)}`);
    left.unshift(`${(12 - x).toFixed(2)} ${y.toFixed(2)}`);
  }
  SHAPE_ICONS.set(shape.id, `M12 ${base}L${right.join('L')}L${left.join('L')}Z`);
}

export function shapeDims(shape: ShapeId, size: Config['size']): { height: number; diameter: number } {
  const d = SHAPE_DIMS.get(shape)!;
  const scale = getSize(size).scale;
  return { height: Math.round(d.height * scale), diameter: Math.round(d.diameter * scale) };
}

export function shapeIcon(shape: ShapeId, className = 'shape-icon'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${SHAPE_ICONS.get(shape)}"/></svg>`;
}

/** Counts a number smoothly towards its target; instant with reduced motion. */
class CountUp {
  private value: number;
  private from = 0;
  private to = 0;
  private start = 0;
  private raf = 0;
  private readonly el: HTMLElement;
  private readonly reduced: boolean;
  private readonly format: (n: number) => string;
  constructor(el: HTMLElement, reduced: boolean, format: (n: number) => string = formatPrice, initial = 0) {
    this.el = el;
    this.reduced = reduced;
    this.format = format;
    this.value = initial;
    this.to = initial;
    el.textContent = format(initial);
  }

  set(target: number): void {
    if (target === this.to) return;
    this.from = this.value;
    this.to = target;
    this.start = performance.now();
    if (this.reduced) {
      this.value = target;
      this.el.textContent = this.format(target);
      return;
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.step);
  }

  private step = (now: number) => {
    const t = Math.min((now - this.start) / 750, 1);
    this.value = this.from + (this.to - this.from) * easeOutExpo(t);
    setText(this.el, this.format(Math.round(this.value)));
    this.raf = t < 1 ? requestAnimationFrame(this.step) : 0;
  };
}

/** Moves focus between the buttons of a group with the arrow keys. */
function arrowNavigation(group: HTMLElement): void {
  group.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + step + buttons.length) % buttons.length;
    buttons[next]!.focus();
  });
}

export function setSegPill(group: HTMLElement, index: number): void {
  const pill = group.querySelector<HTMLElement>('.seg-pill');
  if (!pill) return;
  pill.style.transform = `translate3d(${Math.max(index, 0) * 100}%,0,0)`;
  pill.style.opacity = index < 0 ? '0' : '1';
}

export function createUI(handlers: UIHandlers, reducedMotion: boolean): UI {
  let config: Config | null = null;
  let view: ViewState | null = null;
  const emit = (next: Config) => handlers.onConfig(next);

  // Shapes
  const shapeGroup = byId('opt-shape');
  const shapeButtons = SHAPES.map((shape) => {
    const html = `${shapeIcon(shape.id)}<span class="shape-name">${shape.name}</span><span class="shape-model">${shape.model}</span><span class="shape-price">od ${formatPrice(shape.basePrice)}</span>`;
    const el = button('shape-card', html, () => config && emit({ ...config, shape: shape.id }));
    el.dataset.shape = shape.id;
    el.setAttribute('aria-label', `${shape.name} ${shape.model}, od ${formatPrice(shape.basePrice)}`);
    return el;
  });
  shapeGroup.append(...shapeButtons);

  // Colors
  const colorGroup = byId('opt-color');
  const ring = colorGroup.querySelector<HTMLElement>('.swatch-ring')!;
  const colorButtons = COLORS.map((color) => {
    const el = button('swatch', color.surcharge ? '<span class="swatch-badge" aria-hidden="true"></span>' : '', () => config && emit({ ...config, color: color.id }));
    el.dataset.color = color.id;
    el.style.setProperty('--swatch', color.hex);
    el.setAttribute('aria-label', color.surcharge ? `${color.name}, dopłata ${formatPrice(color.surcharge)}` : color.name);
    el.title = color.surcharge ? `${color.name} (+${formatPrice(color.surcharge)})` : color.name;
    return el;
  });
  colorGroup.append(...colorButtons);

  // Finishes
  const finishGroup = byId('opt-finish');
  const finishButtons = FINISHES.map((finish) => {
    const html = `<span class="ball ball-${finish.id}" aria-hidden="true"></span><span class="seg-text">${finish.name}</span>`;
    const el = button('seg-btn', html, () => config && emit({ ...config, finish: finish.id }));
    el.dataset.finish = finish.id;
    el.setAttribute('aria-label', `${finish.name}, ${finish.surcharge ? `dopłata ${formatPrice(finish.surcharge)}` : 'w cenie'}`);
    return el;
  });
  finishGroup.append(...finishButtons);

  // Sizes
  const sizeGroup = byId('opt-size');
  const sizeButtons = SIZES.map((size) => {
    const el = button('seg-btn seg-btn-stack', `<span class="seg-text">${size.name}</span><span class="seg-sub" data-size-sub></span>`, () => config && emit({ ...config, size: size.id }));
    el.dataset.size = size.id;
    return el;
  });
  sizeGroup.append(...sizeButtons);

  // Extras
  const extrasGroup = byId('opt-extras');
  const extraButtons = EXTRAS.map((extra) => {
    const html = `<span class="extra-check" aria-hidden="true">${icon('check')}</span><span class="extra-text"><span class="extra-name">${extra.name}</span><span class="extra-desc">${extra.description}</span></span><span class="extra-price">+${formatPrice(extra.price)}</span>`;
    const el = button('extra', html, () => config && emit(toggleExtra(config, extra.id)));
    el.dataset.extra = extra.id;
    el.setAttribute('aria-label', `${extra.name}, ${extra.description}, dopłata ${formatPrice(extra.price)}`);
    return el;
  });
  extrasGroup.append(...extraButtons);

  // Environments and camera views
  const envGroup = byId('opt-env');
  const envButtons = ENVIRONMENTS.map((env) => {
    const el = button('seg-btn', `<span class="env-dot" style="background:${env.swatch}" aria-hidden="true"></span><span class="seg-text">${env.name}</span>`, () => handlers.onView({ env: env.id }));
    el.dataset.env = env.id;
    el.title = `${env.name}: ${env.description} (O)`;
    return el;
  });
  envGroup.append(...envButtons);

  const viewGroup = byId('opt-view');
  const viewButtons = VIEW_ORDER.map((id) => {
    const el = button('seg-btn', `<span class="seg-text">${VIEW_LABELS[id]}</span>`, () => handlers.onView({ view: id }));
    el.dataset.view = id;
    el.setAttribute('aria-label', `Widok ${id === 'hero' ? '3/4' : VIEW_LABELS[id].toLowerCase()}`);
    return el;
  });
  viewGroup.append(...viewButtons);

  for (const group of [shapeGroup, colorGroup, finishGroup, sizeGroup, extrasGroup, envGroup, viewGroup]) arrowNavigation(group);

  const presentation = byId<HTMLButtonElement>('toggle-presentation');
  const dimsToggle = byId<HTMLButtonElement>('toggle-dims');
  presentation.addEventListener('click', () => handlers.onView({ presentation: !view?.presentation }));
  dimsToggle.addEventListener('click', () => handlers.onView({ dimensions: !view?.dimensions }));

  const undo = byId<HTMLButtonElement>('btn-undo');
  const redo = byId<HTMLButtonElement>('btn-redo');
  undo.addEventListener('click', handlers.onUndo);
  redo.addEventListener('click', handlers.onRedo);
  const themeButton = byId<HTMLButtonElement>('btn-theme');
  themeButton.addEventListener('click', () => handlers.onView({ theme: view?.theme === 'dark' ? 'light' : 'dark' }));
  byId('btn-help').addEventListener('click', handlers.onHelp);
  byId('btn-saved').addEventListener('click', handlers.onOpenSaved);
  byId('btn-save').addEventListener('click', handlers.onSave);
  byId('btn-export').addEventListener('click', handlers.onExport);
  byId('btn-share').addEventListener('click', handlers.onShare);

  // Price summary
  const summaryToggle = byId<HTMLButtonElement>('summary-toggle');
  const linesWrap = byId('price-lines-wrap');
  const lines = byId<HTMLUListElement>('price-lines');
  const total = new CountUp(byId('price-total'), reducedMotion);
  const totalEl = byId('price-total');
  const vat = byId('price-vat');
  const narrow = window.matchMedia('(max-width: 899px)');
  const setExpanded = (open: boolean) => {
    summaryToggle.setAttribute('aria-expanded', String(open));
    linesWrap.classList.toggle('is-collapsed', !open);
  };
  setExpanded(!narrow.matches);
  summaryToggle.addEventListener('click', () => setExpanded(summaryToggle.getAttribute('aria-expanded') !== 'true'));
  const lineItems = new Map<string, HTMLLIElement>();

  const savedCount = byId('saved-count');
  const toastEl = byId('toast');
  const live = byId('live');
  const introName = byId('intro-name');
  const introTagline = byId('intro-tagline');
  const introSpecs = byId('intro-specs');
  const intro = byId('intro');
  const values = { shape: byId('v-shape'), color: byId('v-color'), finish: byId('v-finish'), size: byId('v-size') };
  const finishNote = byId('finish-note');

  // Cursor glow: one small element on one card, moved with transform, coalesced to one write per frame.
  const panel = byId('panel');
  const glow = panel.querySelector<HTMLElement>('.panel-glow')!;
  let glowX = 0;
  let glowY = 0;
  let glowRaf = 0;
  let panelRect: DOMRect | null = null;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (fine.matches) {
    panel.addEventListener('pointerenter', () => {
      panelRect = panel.getBoundingClientRect();
      panel.classList.add('is-lit');
    });
    panel.addEventListener('pointerleave', () => panel.classList.remove('is-lit'));
    panel.addEventListener('pointermove', (event) => {
      glowX = event.clientX;
      glowY = event.clientY;
      if (!glowRaf)
        glowRaf = requestAnimationFrame(() => {
          glowRaf = 0;
          const r = panelRect ?? (panelRect = panel.getBoundingClientRect());
          glow.style.transform = `translate3d(${glowX - r.left - 160}px,${glowY - r.top - 160}px,0)`;
        });
    });
    window.addEventListener('resize', () => (panelRect = null));
    panel.addEventListener('scroll', () => (panelRect = null), { capture: true, passive: true });
  }

  let lastShape: ShapeId | null = null;

  // Swatch positions are read only on resize, so a click never forces a layout.
  let swatchPositions: { x: number; y: number }[] = [];
  const gridPill = shapeGroup.querySelector<HTMLElement>('.grid-pill')!;
  let lastPill = '';
  let lastRing = '';
  function layoutIndicators(): void {
    if (!config) return;
    const shapeIndex = SHAPES.findIndex((s) => s.id === config!.shape);
    const pill = `translate3d(calc(${shapeIndex % 3} * (100% + var(--grid-gap))), calc(${Math.floor(shapeIndex / 3)} * (100% + var(--grid-gap))), 0)`;
    if (pill !== lastPill) gridPill.style.transform = lastPill = pill;
    if (!swatchPositions.length) swatchPositions = colorButtons.map((b) => ({ x: b.offsetLeft, y: b.offsetTop }));
    const pos = swatchPositions[COLORS.findIndex((c) => c.id === config!.color)];
    const ringValue = pos ? `translate3d(${pos.x}px,${pos.y}px,0)` : '';
    if (ringValue !== lastRing) ring.style.transform = lastRing = ringValue;
  }
  const relayout = new ResizeObserver(() => {
    swatchPositions = [];
    layoutIndicators();
  });
  relayout.observe(shapeGroup);
  relayout.observe(colorGroup);

  function renderLines(next: Config): void {
    const breakdown = priceBreakdown(next);
    const seen = new Set<string>();
    let previous: HTMLLIElement | null = null;
    for (const line of breakdown.lines) {
      seen.add(line.id);
      let li = lineItems.get(line.id);
      if (!li) {
        li = document.createElement('li');
        li.className = 'price-line';
        li.innerHTML = '<span class="pl-text"><span class="pl-label"></span><span class="pl-detail"></span></span><span class="pl-amount"></span>';
        if (config && !reducedMotion) li.classList.add('is-new');
        lineItems.set(line.id, li);
      }
      setText(li.querySelector('.pl-label')!, line.label);
      setText(li.querySelector('.pl-detail')!, line.detail);
      setText(li.querySelector('.pl-amount')!, line.id === 'base' ? formatPrice(line.amount) : formatDelta(line.amount));
      const expected: Element | null = previous ? previous.nextElementSibling : lines.firstElementChild;
      if (expected !== li) lines.insertBefore(li, expected);
      previous = li;
    }
    for (const [id, li] of lineItems) {
      if (!seen.has(id)) {
        li.remove();
        lineItems.delete(id);
      }
    }
    if (config && breakdown.total !== priceBreakdown(config).total && !reducedMotion) {
      totalEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    total.set(breakdown.total);
    setText(vat, `w tym VAT 23%: ${formatPrice(breakdown.vat)}`);
  }

  function renderIntro(next: Config): void {
    const shape = getShape(next.shape);
    const dims = shapeDims(next.shape, next.size);
    const specs = `<li>${dims.height} cm wys.</li><li>Ø ${dims.diameter} cm</li><li>${getFinish(next.finish).name}</li>`;
    const apply = () => {
      setText(introName, productName(next));
      setText(introTagline, shape.tagline);
      if (introSpecs.innerHTML !== specs) introSpecs.innerHTML = specs;
    };
    if (lastShape !== null && lastShape !== next.shape && !reducedMotion) {
      const out = intro.animate([{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: 'translate3d(0,-6px,0)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
      out.onfinish = () => {
        apply();
        intro.animate([{ opacity: 0, transform: 'translate3d(0,8px,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
      };
    } else {
      apply();
    }
    lastShape = next.shape;
  }

  return {
    render(next, nextView, history) {
      SHAPES.forEach((s, i) => setPressed(shapeButtons[i]!, s.id === next.shape));
      COLORS.forEach((c, i) => setPressed(colorButtons[i]!, c.id === next.color));
      FINISHES.forEach((f, i) => setPressed(finishButtons[i]!, f.id === next.finish));
      SIZES.forEach((s, i) => setPressed(sizeButtons[i]!, s.id === next.size));
      EXTRAS.forEach((e, i) => setPressed(extraButtons[i]!, next.extras.includes(e.id)));
      setSegPill(finishGroup, FINISHES.findIndex((f) => f.id === next.finish));
      setSegPill(sizeGroup, SIZES.findIndex((s) => s.id === next.size));

      const color = getColor(next.color);
      const finish = getFinish(next.finish);
      const size = getSize(next.size);
      finishGroup.style.setProperty('--ball', color.hex);
      shapeGroup.style.setProperty('--sel', color.hex);
      setText(values.shape, productName(next));
      setText(values.color, color.surcharge ? `${color.name} · +${formatPrice(color.surcharge)}` : color.name);
      setText(values.finish, finish.surcharge ? `+${formatPrice(finish.surcharge)}` : 'w cenie');
      setText(finishNote, finish.description);
      setText(values.size, `${size.label} · ${size.surcharge ? formatDelta(size.surcharge) : 'w cenie'}`);
      SIZES.forEach((s, i) => {
        const dims = shapeDims(next.shape, s.id);
        setText(sizeButtons[i]!.querySelector<HTMLElement>('[data-size-sub]')!, `${dims.height} cm`);
        sizeButtons[i]!.setAttribute('aria-label', `Rozmiar ${s.name}, ${s.label}, ${dims.height} cm wysokości${s.surcharge ? `, ${s.surcharge > 0 ? 'dopłata' : 'rabat'} ${formatPrice(Math.abs(s.surcharge))}` : ''}`);
      });

      renderLines(next);
      renderIntro(next);
      config = { ...next };
      layoutIndicators();

      // View controls
      ENVIRONMENTS.forEach((env, i) => setPressed(envButtons[i]!, env.id === nextView.env));
      setSegPill(envGroup, ENVIRONMENTS.findIndex((env) => env.id === nextView.env));
      VIEW_ORDER.forEach((id, i) => setPressed(viewButtons[i]!, id === nextView.view));
      setSegPill(viewGroup, nextView.view ? VIEW_ORDER.indexOf(nextView.view) : -1);
      setPressed(presentation, nextView.presentation);
      setPressed(dimsToggle, nextView.dimensions);
      setPressed(themeButton, nextView.theme === 'light');
      themeButton.setAttribute('aria-label', nextView.theme === 'dark' ? 'Włącz jasny motyw' : 'Włącz ciemny motyw');
      view = { ...nextView };

      undo.disabled = !history.canUndo;
      redo.disabled = !history.canRedo;
    },
    setSavedCount(count, bump) {
      setText(savedCount, String(count));
      savedCount.classList.toggle('is-zero', count === 0);
      if (bump && !reducedMotion) {
        savedCount.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 480, easing: 'cubic-bezier(.3,1.6,.5,1)' });
      }
    },
    toast(message) {
      toastEl.textContent = message;
      toastEl.classList.remove('is-visible');
      void toastEl.offsetWidth;
      toastEl.classList.add('is-visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove('is-visible'), 2400);
    },
    announce(message) {
      live.textContent = message;
    },
    layoutIndicators,
  };
}

let toastTimer = 0;
