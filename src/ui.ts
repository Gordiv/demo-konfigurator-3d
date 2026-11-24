import {
  COLORS,
  FINISHES,
  SHAPES,
  calculatePrice,
  describe,
  formatPrice,
  getColor,
  type Config,
  type ShapeId,
  type Theme,
} from './config';

export interface ViewState {
  autoRotate: boolean;
  speed: number;
  wireframe: boolean;
  theme: Theme;
}

export interface UIHandlers {
  onConfig(patch: Partial<Config>): void;
  onView(patch: Partial<ViewState>): void;
  onSnapshot(): void;
  onCopyLink(): void;
}

export interface UI {
  render(config: Config, view: ViewState): void;
  setSnapshotBusy(busy: boolean): void;
  toast(message: string): void;
}

const SHAPE_ICONS: Record<ShapeId, string> = {
  vase: 'M9.5 2.5h5v1.6c0 1.3 3.5 2.9 3.5 8.1 0 5.1-2.7 9.3-6 9.3s-6-4.2-6-9.3c0-5.2 3.5-6.8 3.5-8.1z',
  bottle: 'M10.6 2h2.8v4.4c0 1.3 3.6 2.2 3.6 5.3v8.5a1.8 1.8 0 0 1-1.8 1.8H8.8A1.8 1.8 0 0 1 7 20.2v-8.5c0-3.1 3.6-4 3.6-5.3z',
  planter: 'M3.5 5h17l-.4 2.2h-1.3l-1.6 12.4a2 2 0 0 1-2 1.7H8.8a2 2 0 0 1-2-1.7L5.2 7.2H3.9z',
};

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function button(className: string, content: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.innerHTML = content;
  element.setAttribute('aria-pressed', 'false');
  element.addEventListener('click', onClick);
  return element;
}

function setPressed(element: HTMLElement, pressed: boolean): void {
  element.setAttribute('aria-pressed', String(pressed));
}

export function createUI(handlers: UIHandlers): UI {
  const shapeButtons = SHAPES.map((shape) => {
    const icon = `<svg class="option-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${SHAPE_ICONS[shape.id]}"/></svg>`;
    const label = `<span class="option-name">${shape.name}</span><span class="option-meta">${formatPrice(shape.basePrice)}</span>`;
    const element = button('option', icon + label, () => handlers.onConfig({ shape: shape.id }));
    element.setAttribute('aria-label', `${shape.name}, ${formatPrice(shape.basePrice)}`);
    return element;
  });
  byId('opt-shape').append(...shapeButtons);

  const colorButtons = COLORS.map((color, index) => {
    const swatch = button('swatch', '', () => handlers.onConfig({ color: index }));
    swatch.style.setProperty('--swatch', color.hex);
    swatch.setAttribute('aria-label', color.name);
    swatch.title = color.name;
    return swatch;
  });
  byId('opt-color').append(...colorButtons);

  const finishButtons = FINISHES.map((finish) => {
    const meta = finish.surcharge > 0 ? `+${formatPrice(finish.surcharge)}` : 'w cenie';
    const label = `<span class="option-name">${finish.name}</span><span class="option-meta">${meta}</span>`;
    const element = button('option', label, () => handlers.onConfig({ finish: finish.id }));
    element.setAttribute('aria-label', `${finish.name}, ${finish.surcharge > 0 ? `dopłata ${formatPrice(finish.surcharge)}` : 'w cenie'}`);
    return element;
  });
  byId('opt-finish').append(...finishButtons);

  const rotateToggle = byId<HTMLButtonElement>('toggle-rotate');
  const wireToggle = byId<HTMLButtonElement>('toggle-wire');
  const speed = byId<HTMLInputElement>('speed');
  const speedValue = byId<HTMLOutputElement>('speed-value');
  const themeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-theme-value]'));
  const colorName = byId('color-name');
  const summary = byId('summary');
  const price = byId('price');
  const snapshotButton = byId<HTMLButtonElement>('btn-png');
  const toastElement = byId('toast');

  let view: ViewState | null = null;
  rotateToggle.addEventListener('click', () => handlers.onView({ autoRotate: !view?.autoRotate }));
  wireToggle.addEventListener('click', () => handlers.onView({ wireframe: !view?.wireframe }));
  speed.addEventListener('input', () => handlers.onView({ speed: speed.valueAsNumber }));
  for (const themeButton of themeButtons) {
    themeButton.addEventListener('click', () => handlers.onView({ theme: themeButton.dataset.themeValue as Theme }));
  }
  snapshotButton.addEventListener('click', handlers.onSnapshot);
  byId('btn-link').addEventListener('click', handlers.onCopyLink);

  let toastTimer = 0;

  return {
    render(config, nextView) {
      view = nextView;
      SHAPES.forEach((shape, i) => setPressed(shapeButtons[i]!, shape.id === config.shape));
      colorButtons.forEach((swatch, i) => setPressed(swatch, i === config.color));
      FINISHES.forEach((finish, i) => setPressed(finishButtons[i]!, finish.id === config.finish));
      colorName.textContent = getColor(config.color).name;
      summary.textContent = describe(config);
      price.textContent = formatPrice(calculatePrice(config));

      setPressed(rotateToggle, nextView.autoRotate);
      setPressed(wireToggle, nextView.wireframe);
      speed.value = String(nextView.speed);
      speedValue.textContent = `${nextView.speed} obr./min`;
      speed.setAttribute('aria-valuetext', `${nextView.speed} obrotów na minutę`);
      for (const themeButton of themeButtons) {
        setPressed(themeButton, themeButton.dataset.themeValue === nextView.theme);
      }
    },
    setSnapshotBusy(busy) {
      snapshotButton.disabled = busy;
    },
    toast(message) {
      toastElement.textContent = message;
      toastElement.classList.add('is-visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastElement.classList.remove('is-visible'), 2200);
    },
  };
}
