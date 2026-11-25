import './style.css';
import {
  COLORS,
  DEFAULT_CONFIG,
  ENVIRONMENT_IDS,
  FINISHES,
  SHAPES,
  SIZES,
  decodeHash,
  encodeHash,
  fileName,
  getColor,
  getFinish,
  getSize,
  priceBreakdown,
  productName,
  sameConfig,
  type Config,
  type EnvironmentId,
  type Theme,
} from './config';
import { History } from './history';
import { SavedStore, readPreference, writePreference } from './storage';
import { createStage, detectWebGL, type Stage } from './scene';
import { createUI, type ViewState } from './ui';
import { createDialogs, type CompareEntry } from './dialogs';
import { cycle, resolveShortcut } from './shortcuts';
import { getEnvironment, type BackdropPalette } from './environments';
import { hydrateIcons } from './icons';
import { installFrameMeter } from './fps';

hydrateIcons();

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
const root = document.documentElement;

const fromHash = decodeHash(location.hash);
const history = new History<Config>(fromHash?.config ?? DEFAULT_CONFIG, sameConfig);
const savedTheme = readPreference('theme');
const savedEnv = readPreference('env');
let themeChosen = savedTheme === 'light' || savedTheme === 'dark';
let view: ViewState = {
  theme: themeChosen ? (savedTheme as Theme) : darkScheme.matches ? 'dark' : 'light',
  env: fromHash?.env ?? ((ENVIRONMENT_IDS as readonly string[]).includes(savedEnv ?? '') ? (savedEnv as EnvironmentId) : 'studio'),
  view: 'hero',
  presentation: false,
  dimensions: false,
};

// Backdrop: two pre-rendered gradient sets, cross-faded with opacity only.
const backdropSets = Array.from(document.querySelectorAll<HTMLElement>('.bg-set'));
let activeSet = -1;
function applyBackdrop(): void {
  const palette = getEnvironment(view.env).palette[view.theme];
  const next = activeSet === -1 || reducedMotion ? 0 : 1 - activeSet;
  const set = backdropSets[next]!;
  set.style.setProperty('--base', palette.base);
  set.style.setProperty('--g1', palette.glow1);
  set.style.setProperty('--g2', palette.glow2);
  set.style.setProperty('--g3', palette.glow3);
  backdropSets.forEach((el, i) => el.classList.toggle('is-active', i === next));
  activeSet = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.base);
}

function applyTheme(): void {
  root.dataset.theme = view.theme;
  root.style.colorScheme = view.theme;
}
applyTheme();
applyBackdrop();

/** Paints the same backdrop as the page into a 2D canvas (PNG export and thumbnails). */
function paintBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const p: BackdropPalette = getEnvironment(view.env).palette[view.theme];
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, w, h);
  const blob = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    // Fade to the same color at zero alpha; fading to transparent black would leave a grey halo.
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/,\s*[\d.]+\)$/, ', 0)'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  const m = Math.max(w, h);
  blob(w * 0.2, h * 0.15, m * 0.6, p.glow1);
  blob(w * 0.85, h * 0.3, m * 0.55, p.glow2);
  blob(w * 0.5, h * 0.78, m * 0.42, p.glow3);
}

const stageWrap = document.getElementById('stage-wrap')!;
const stageElement = document.getElementById('stage')!;
const hint = document.getElementById('stage-hint')!;
if (window.matchMedia('(pointer: coarse)').matches) document.getElementById('stage-hint-text')!.textContent = 'Przeciągnij, aby obrócić · rozsuń palce, aby przybliżyć';

let stage: Stage | null = null;
const support = detectWebGL();
// Software rendering also composites in software: keep the backdrop static there.
root.classList.toggle('is-software', support.software);
if (support.available) {
  try {
    stage = createStage(stageElement, {
      reducedMotion,
      software: support.software,
      onFirstInteraction: () => hint.classList.add('is-faded'),
      onViewChange: (next) => {
        if (view.view === next) return;
        view = { ...view, view: next };
        render();
      },
      onReady: () => stageWrap.classList.add('is-ready'),
    });
  } catch {
    stage = null;
  }
}
if (!stage) {
  hint.hidden = true;
  stageWrap.classList.add('no-webgl');
  document.getElementById('stage-fallback')!.hidden = false;
  for (const id of ['btn-export', 'toggle-presentation', 'toggle-dims']) (document.getElementById(id) as HTMLButtonElement).disabled = true;
}

const store = new SavedStore();

const ui = createUI(
  {
    onConfig: (next) => commit(next),
    onView: (patch) => setView(patch),
    onUndo: undo,
    onRedo: redo,
    onSave: save,
    onExport: () => stage && dialogs.openExport(),
    onShare: share,
    onOpenSaved: () => dialogs.openSaved(),
    onHelp: () => dialogs.openHelp(),
  },
  reducedMotion,
);

const thumbnailOf = (): string => stage?.thumbnail(320, 240, paintBackdrop) ?? '';

const dialogs = createDialogs(
  {
    onLoad: (config) => {
      commit(config);
      ui.toast('Wczytano konfigurację');
    },
    onDelete: (id) => {
      store.remove(id);
      dialogs.setItems(store.list());
      ui.setSavedCount(store.list().length);
      ui.toast('Usunięto konfigurację');
    },
    onSaveCurrent: () => {
      save();
      dialogs.setItems(store.list());
    },
    currentEntry: (): CompareEntry => ({ title: 'Bieżąca konfiguracja', config: history.current, thumbnail: thumbnailOf() }),
    onExport: async ({ transparent, width, height }) => {
      if (!stage) return;
      try {
        const blob = await stage.exportImage({ width, height, background: transparent ? null : paintBackdrop });
        if (!blob) throw new Error('empty');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName(history.current, transparent ? 'przezroczyste' : '');
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        ui.toast(`Zapisano PNG ${width} × ${height}`);
      } catch {
        ui.toast('Nie udało się zapisać obrazu');
      }
    },
    exportPreview: (transparent) => stage?.thumbnail(320, 240, transparent ? null : paintBackdrop) ?? '',
    maxExportSize: () => stage?.maxExportSize() ?? 0,
  },
  reducedMotion,
);
dialogs.setItems(store.list());
ui.setSavedCount(store.list().length);

let announceTimer = 0;
let hashTimer = 0;
function writeHash(): void {
  const hash = `#${encodeHash(history.current, view.env === 'studio' ? undefined : view.env)}`;
  if (location.hash !== hash) window.history.replaceState(null, '', hash);
}
function render(): void {
  ui.render(history.current, view, history);
}

function apply(): void {
  const config = history.current;
  stage?.setConfig(config);
  render();
  // The address bar is updated after the user pauses, not on every click.
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(writeHash, 300);
  window.clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => {
    ui.announce(`${productName(config)}, ${getColor(config.color).name}, ${getFinish(config.finish).name}, rozmiar ${getSize(config.size).name}. Razem ${priceBreakdown(config).total} zł.`);
  }, 500);
}

function commit(next: Config): void {
  if (history.push(next)) apply();
}

function undo(): void {
  if (history.undo()) {
    apply();
    ui.announce('Cofnięto zmianę');
  }
}

function redo(): void {
  if (history.redo()) {
    apply();
    ui.announce('Ponowiono zmianę');
  }
}

function setView(patch: Partial<ViewState>): void {
  const next = { ...view, ...patch };
  if (patch.theme && patch.theme !== view.theme) {
    themeChosen = true;
    writePreference('theme', patch.theme);
  }
  if (patch.view) next.presentation = false;
  const prev = view;
  view = next;
  if (next.theme !== prev.theme) {
    applyTheme();
    stage?.setTheme(next.theme);
  }
  if (next.theme !== prev.theme || next.env !== prev.env) applyBackdrop();
  if (next.env !== prev.env) {
    stage?.setEnvironment(next.env);
    writePreference('env', next.env);
    ui.announce(`Otoczenie: ${getEnvironment(next.env).name}`);
  }
  if (patch.view) stage?.setView(patch.view);
  if (next.presentation !== prev.presentation) stage?.setAutoRotate(next.presentation);
  if (next.dimensions !== prev.dimensions) stage?.setDimensions(next.dimensions);
  if (next.env !== prev.env) apply();
  else render();
}

function save(): void {
  const config = history.current;
  const name = `${productName(config)} · ${getColor(config.color).name}`;
  const { persisted } = store.add(config, name, thumbnailOf());
  dialogs.setItems(store.list());
  ui.setSavedCount(store.list().length, true);
  ui.toast(persisted ? 'Zapisano w „Zapisanych”' : 'Zapisano tylko do zamknięcia karty (brak dostępu do pamięci przeglądarki)');
}

async function share(): Promise<void> {
  window.clearTimeout(hashTimer);
  writeHash();
  const copied = await copyText(location.href);
  ui.toast(copied ? 'Skopiowano link do konfiguracji' : 'Skopiuj link z paska adresu');
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

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  const action = resolveShortcut(event);
  if (!action) return;
  if (dialogs.isAnyOpen()) return;
  const config = history.current;
  event.preventDefault();
  switch (action.type) {
    case 'shape': {
      const shape = SHAPES[action.index];
      if (shape) commit({ ...config, shape: shape.id });
      break;
    }
    case 'color':
      commit({ ...config, color: cycle(COLORS.map((c) => c.id), config.color, action.step) });
      break;
    case 'finish':
      commit({ ...config, finish: cycle(FINISHES.map((f) => f.id), config.finish, action.step) });
      break;
    case 'size':
      commit({ ...config, size: cycle(SIZES.map((s) => s.id), config.size, action.step) });
      break;
    case 'environment':
      setView({ env: cycle(ENVIRONMENT_IDS, view.env, action.step) });
      break;
    case 'view':
      if (stage) setView({ view: action.view });
      break;
    case 'toggle':
      if (action.what === 'theme') setView({ theme: view.theme === 'dark' ? 'light' : 'dark' });
      else if (stage && action.what === 'presentation') setView({ presentation: !view.presentation });
      else if (stage) setView({ dimensions: !view.dimensions });
      break;
    case 'undo':
      undo();
      break;
    case 'redo':
      redo();
      break;
    case 'save':
      save();
      break;
    case 'open':
      if (action.what === 'help') dialogs.openHelp();
      else if (action.what === 'saved') dialogs.openSaved();
      else if (stage) dialogs.openExport();
      break;
  }
});

window.addEventListener('hashchange', () => {
  const parsed = decodeHash(location.hash);
  if (!parsed) return;
  if (parsed.env && parsed.env !== view.env) setView({ env: parsed.env });
  commit(parsed.config);
});

darkScheme.addEventListener('change', (event) => {
  if (!themeChosen) setView({ theme: event.matches ? 'dark' : 'light' });
});

// Keep the product centred in the part of the viewport that panels do not cover.
const topbar = document.querySelector<HTMLElement>('.topbar')!;
const panel = document.getElementById('panel')!;
const controls = document.querySelector<HTMLElement>('.stage-controls')!;
const intro = document.getElementById('intro')!;
const desktop = window.matchMedia('(min-width: 900px)');
function updateInsets(): void {
  if (!stage) return;
  const s = stageWrap.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const c = controls.getBoundingClientRect();
  const t = topbar.getBoundingClientRect();
  const i = intro.getBoundingClientRect();
  const wide = desktop.matches;
  stage.setInsets({
    top: Math.max(0, (wide ? t.bottom : Math.max(t.bottom, i.bottom - 24)) - s.top) + 8,
    right: wide && p.left < s.right ? s.right - p.left + 8 : 0,
    bottom: Math.max(0, s.bottom - c.top) + 8,
    left: wide ? Math.min(i.width * 0.3, 160) : 0,
  });
}
const insetObserver = new ResizeObserver(updateInsets);
[stageWrap, panel, controls, topbar, intro].forEach((el) => insetObserver.observe(el));
updateInsets();

stage?.setTheme(view.theme);
stage?.setEnvironment(view.env);
apply();

if (stage && new URLSearchParams(location.search).has('fps')) installFrameMeter(stage);
