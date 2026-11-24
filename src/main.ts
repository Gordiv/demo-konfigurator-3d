import './style.css';
import { DEFAULT_CONFIG, fileName, parseHash, serializeHash, type Config, type Theme } from './config';
import { createStage, isWebGLAvailable, type Stage } from './scene';
import { createUI, type ViewState } from './ui';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

let config: Config = parseHash(location.hash) ?? DEFAULT_CONFIG;
let view: ViewState = {
  autoRotate: !reducedMotion,
  speed: 6,
  wireframe: false,
  theme: darkScheme.matches ? 'dark' : 'light',
};
let themeChosen = false;

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
applyTheme(view.theme);

const stageElement = document.getElementById('stage')!;
const hint = document.getElementById('stage-hint')!;
if (window.matchMedia('(pointer: coarse)').matches) {
  hint.textContent = 'Przeciągnij, aby obrócić · rozsuń palce, aby przybliżyć';
}
let stage: Stage | null = null;

if (isWebGLAvailable()) {
  try {
    stage = createStage(stageElement, {
      reducedMotion,
      onFirstInteraction: () => hint.classList.add('is-faded'),
    });
  } catch {
    stage = null;
  }
}
if (!stage) {
  hint.hidden = true;
  document.getElementById('stage-fallback')!.hidden = false;
  document.getElementById('btn-png')!.hidden = true;
}

const ui = createUI({
  onConfig(patch) {
    setConfig({ ...config, ...patch });
  },
  onView(patch) {
    if (patch.theme) themeChosen = true;
    setView({ ...view, ...patch });
  },
  async onSnapshot() {
    if (!stage) return;
    ui.setSnapshotBusy(true);
    try {
      const blob = await stage.snapshot();
      if (!blob) throw new Error('Empty snapshot');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName(config);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ui.toast('Zapisano obraz PNG');
    } catch {
      ui.toast('Nie udało się zapisać obrazu');
    } finally {
      ui.setSnapshotBusy(false);
    }
  },
  async onCopyLink() {
    const copied = await copyText(location.href);
    ui.toast(copied ? 'Skopiowano link' : 'Skopiuj link z paska adresu');
  },
});

function setConfig(next: Config): void {
  config = next;
  history.replaceState(null, '', `#${serializeHash(config)}`);
  stage?.setConfig(config);
  ui.render(config, view);
}

function setView(next: ViewState): void {
  if (next.theme !== view.theme) {
    applyTheme(next.theme);
    stage?.setTheme(next.theme);
  }
  view = next;
  stage?.setAutoRotate(view.autoRotate);
  stage?.setSpeed(view.speed);
  stage?.setWireframe(view.wireframe);
  ui.render(config, view);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without the async clipboard API or without permission.
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    field.remove();
    return ok;
  }
}

window.addEventListener('hashchange', () => {
  const parsed = parseHash(location.hash);
  if (parsed && serializeHash(parsed) !== serializeHash(config)) setConfig(parsed);
});

darkScheme.addEventListener('change', (event) => {
  if (!themeChosen) setView({ ...view, theme: event.matches ? 'dark' : 'light' });
});

stage?.setTheme(view.theme);
setView(view);
setConfig(config);
