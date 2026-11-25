import {
  EXTRAS,
  formatDelta,
  formatPrice,
  getColor,
  getFinish,
  getSize,
  priceBreakdown,
  productName,
  type Config,
} from './config';
import { SHORTCUT_HELP } from './shortcuts';
import type { SavedConfig } from './storage';
import { icon } from './icons';
import { setSegPill, shapeDims, shapeIcon } from './ui';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dateFormat = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function openDialog(dialog: HTMLDialogElement, reducedMotion: boolean): void {
  if (dialog.open) return;
  dialog.showModal();
  if (!reducedMotion) {
    dialog.animate(
      [
        { opacity: 0, transform: 'translate3d(0,14px,0) scale(0.98)' },
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
      ],
      { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }
}

function wireClose(dialog: HTMLDialogElement): void {
  for (const el of dialog.querySelectorAll<HTMLElement>('[data-close]')) el.addEventListener('click', () => dialog.close());
  // Click on the backdrop closes the dialog.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

export interface CompareEntry {
  title: string;
  config: Config;
  thumbnail: string;
  savedId?: string;
}

export interface DialogHandlers {
  onLoad(config: Config): void;
  onDelete(id: string): void;
  onSaveCurrent(): void;
  currentEntry(): CompareEntry;
  onExport(options: { transparent: boolean; width: number; height: number }): Promise<void>;
  exportPreview(transparent: boolean): string;
  maxExportSize(): number;
}

const EXPORT_SIZES = [
  { width: 1600, height: 1200, label: '1600 × 1200' },
  { width: 2400, height: 1800, label: '2400 × 1800' },
  { width: 3200, height: 2400, label: '3200 × 2400' },
];

function extrasText(config: Config): string {
  return config.extras.length ? EXTRAS.filter((e) => config.extras.includes(e.id)).map((e) => e.name).join(', ') : 'Brak';
}

function thumb(src: string, config: Config, className: string): string {
  return src
    ? `<img class="${className}" src="${src}" alt="" width="320" height="240" decoding="async" />`
    : `<span class="${className} thumb-empty" style="--swatch:${getColor(config.color).hex}">${shapeIcon(config.shape, 'thumb-icon')}</span>`;
}

export function createDialogs(handlers: DialogHandlers, reducedMotion: boolean) {
  const saved = $<HTMLDialogElement>('dlg-saved');
  const compare = $<HTMLDialogElement>('dlg-compare');
  const exporter = $<HTMLDialogElement>('dlg-export');
  const help = $<HTMLDialogElement>('dlg-help');
  [saved, compare, exporter, help].forEach(wireClose);

  // Help
  $('shortcut-list').innerHTML = SHORTCUT_HELP.map(
    (item) => `<div class="shortcut"><dt>${item.keys.map((k) => (k === '–' ? '<span class="kbd-sep">–</span>' : `<kbd>${k}</kbd>`)).join('')}</dt><dd>${item.label}</dd></div>`,
  ).join('');

  // Saved list
  const list = $('saved-list');
  const compareButton = $<HTMLButtonElement>('btn-compare');
  const compareLabel = $('btn-compare-label');
  const sub = $('saved-sub');
  const selected = new Set<string>();
  let items: readonly SavedConfig[] = [];

  function renderSaved(): void {
    for (const id of selected) if (!items.some((item) => item.id === id)) selected.delete(id);
    if (!items.length) {
      list.innerHTML = `<div class="empty">${icon('bookmark', 'empty-icon')}<p class="empty-title">Brak zapisanych konfiguracji</p><p>Użyj przycisku „Zapisz konfigurację” w panelu albo skrótu Ctrl+S.</p></div>`;
    } else {
      list.innerHTML = items
        .map((item) => {
          const total = priceBreakdown(item.config).total;
          const on = selected.has(item.id);
          return `<article class="saved-card${on ? ' is-selected' : ''}" data-id="${item.id}">
            ${thumb(item.thumbnail, item.config, 'saved-thumb')}
            <div class="saved-info">
              <h3 class="saved-name">${escapeHtml(item.name)}</h3>
              <p class="saved-meta">${getColor(item.config.color).name} · ${getFinish(item.config.finish).name} · ${getSize(item.config.size).name}</p>
              <p class="saved-price">${formatPrice(total)} <span>${dateFormat.format(item.createdAt)}</span></p>
            </div>
            <div class="saved-actions">
              <button type="button" class="check-btn" data-act="select" aria-pressed="${on}" aria-label="Zaznacz do porównania: ${escapeHtml(item.name)}">${icon('check')}<span>Porównaj</span></button>
              <button type="button" class="btn btn-sm" data-act="load">Wczytaj</button>
              <button type="button" class="icon-btn icon-btn-sm" data-act="delete" aria-label="Usuń: ${escapeHtml(item.name)}">${icon('trash')}</button>
            </div>
          </article>`;
        })
        .join('');
    }
    const n = selected.size;
    compareButton.disabled = n === 0;
    compareLabel.textContent = n === 2 ? 'Porównaj zaznaczone' : n === 1 ? 'Porównaj z bieżącą' : 'Porównaj';
    sub.textContent = items.length ? `Zapisano ${items.length} z 12. Zaznacz jedną lub dwie, aby porównać.` : 'Zapisuj warianty, aby wrócić do nich później.';
  }

  list.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    const card = target?.closest<HTMLElement>('.saved-card');
    if (!target || !card) return;
    const id = card.dataset.id!;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const act = target.dataset.act;
    if (act === 'select') {
      if (selected.has(id)) selected.delete(id);
      else {
        if (selected.size >= 2) selected.delete(selected.values().next().value!);
        selected.add(id);
      }
      renderSaved();
      list.querySelector<HTMLButtonElement>(`.saved-card[data-id="${id}"] [data-act="select"]`)?.focus();
    } else if (act === 'load') {
      handlers.onLoad(item.config);
      saved.close();
    } else if (act === 'delete') {
      handlers.onDelete(id);
    }
  });

  $('btn-save-current').addEventListener('click', handlers.onSaveCurrent);

  // Compare
  function renderCompare(a: CompareEntry, b: CompareEntry): void {
    const rows: [string, (c: Config) => string][] = [
      ['Model', (c) => productName(c)],
      ['Kolor', (c) => getColor(c.color).name],
      ['Wykończenie', (c) => getFinish(c.finish).name],
      ['Rozmiar', (c) => `${getSize(c.size).name} · ${getSize(c.size).label}`],
      ['Wymiary', (c) => {
        const d = shapeDims(c.shape, c.size);
        return `${d.height} × Ø ${d.diameter} cm`;
      }],
      ['Dodatki', extrasText],
    ];
    const pa = priceBreakdown(a.config);
    const pb = priceBreakdown(b.config);
    const diff = pb.total - pa.total;
    const col = (entry: CompareEntry, price: number, index: number) => `
      <div class="compare-col">
        ${thumb(entry.thumbnail, entry.config, 'compare-thumb')}
        <p class="compare-tag">${index === 0 ? 'A' : 'B'}</p>
        <h3 class="compare-title">${escapeHtml(entry.title)}</h3>
        <p class="compare-price">${formatPrice(price)}</p>
        <button type="button" class="btn btn-sm" data-load="${index}">Wczytaj</button>
      </div>`;
    const body = $('compare-body');
    body.innerHTML = `
      <div class="compare-head">${col(a, pa.total, 0)}${col(b, pb.total, 1)}</div>
      <table class="compare-table">
        <caption class="sr-only">Porównanie parametrów konfiguracji A i B</caption>
        <thead><tr><th scope="col">Parametr</th><th scope="col">A</th><th scope="col">B</th></tr></thead>
        <tbody>
          ${rows
            .map(([label, get]) => {
              const va = get(a.config);
              const vb = get(b.config);
              return `<tr class="${va !== vb ? 'is-diff' : ''}"><th scope="row">${label}</th><td>${escapeHtml(va)}</td><td>${escapeHtml(vb)}</td></tr>`;
            })
            .join('')}
          <tr class="compare-total${diff !== 0 ? ' is-diff' : ''}"><th scope="row">Cena</th><td>${formatPrice(pa.total)}</td><td>${formatPrice(pb.total)}</td></tr>
        </tbody>
      </table>
      <p class="compare-diff">${diff === 0 ? 'Obie konfiguracje kosztują tyle samo.' : `B jest ${diff > 0 ? 'droższa' : 'tańsza'} o <strong>${formatPrice(Math.abs(diff))}</strong> (${formatDelta(diff)}).`}</p>`;
    body.querySelectorAll<HTMLButtonElement>('[data-load]').forEach((el) =>
      el.addEventListener('click', () => {
        handlers.onLoad((el.dataset.load === '0' ? a : b).config);
        compare.close();
      }),
    );
  }

  compareButton.addEventListener('click', () => {
    const chosen = items.filter((item) => selected.has(item.id));
    const entries: CompareEntry[] = chosen.map((item) => ({ title: item.name, config: item.config, thumbnail: item.thumbnail, savedId: item.id }));
    if (entries.length === 1) entries.unshift(handlers.currentEntry());
    if (entries.length !== 2) return;
    renderCompare(entries[0]!, entries[1]!);
    saved.close();
    openDialog(compare, reducedMotion);
  });

  // Export
  const bgGroup = $('ex-bg');
  const sizeGroup = $('ex-size');
  const go = $<HTMLButtonElement>('btn-export-go');
  const preview = $<HTMLImageElement>('export-thumb');
  const previewWrap = $('export-preview');
  let transparent = false;
  let sizeIndex = 1;
  const makeSeg = (group: HTMLElement, labels: string[], onPick: (i: number) => void) =>
    labels.map((label, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'seg-btn';
      el.innerHTML = `<span class="seg-text">${label}</span>`;
      el.setAttribute('aria-pressed', 'false');
      el.addEventListener('click', () => onPick(i));
      group.append(el);
      return el;
    });
  const bgButtons = makeSeg(bgGroup, ['Z tłem', 'Przezroczyste'], (i) => {
    transparent = i === 1;
    renderExport(true);
  });
  const sizeButtons = makeSeg(sizeGroup, EXPORT_SIZES.map((s) => s.label.replace(' × ', '×')), (i) => {
    sizeIndex = i;
    renderExport(false);
  });

  function renderExport(refreshPreview: boolean): void {
    const max = handlers.maxExportSize();
    EXPORT_SIZES.forEach((s, i) => {
      sizeButtons[i]!.disabled = Math.max(s.width, s.height) > max;
      sizeButtons[i]!.setAttribute('aria-label', `${s.width} na ${s.height} pikseli`);
    });
    if (sizeButtons[sizeIndex]!.disabled) sizeIndex = 0;
    bgButtons.forEach((el, i) => el.setAttribute('aria-pressed', String((i === 1) === transparent)));
    sizeButtons.forEach((el, i) => el.setAttribute('aria-pressed', String(i === sizeIndex)));
    setSegPill(bgGroup, transparent ? 1 : 0);
    setSegPill(sizeGroup, sizeIndex);
    previewWrap.classList.toggle('is-transparent', transparent);
    if (refreshPreview) preview.src = handlers.exportPreview(transparent);
  }

  go.addEventListener('click', async () => {
    go.disabled = true;
    go.classList.add('is-busy');
    try {
      const size = EXPORT_SIZES[sizeIndex]!;
      await handlers.onExport({ transparent, width: size.width, height: size.height });
      exporter.close();
    } finally {
      go.disabled = false;
      go.classList.remove('is-busy');
    }
  });

  return {
    saved,
    compare,
    exporter,
    help,
    isAnyOpen: () => [saved, compare, exporter, help].some((d) => d.open),
    setItems(next: readonly SavedConfig[]) {
      items = next;
      if (saved.open) renderSaved();
    },
    openSaved() {
      renderSaved();
      openDialog(saved, reducedMotion);
    },
    openCompare(a: CompareEntry, b: CompareEntry) {
      renderCompare(a, b);
      openDialog(compare, reducedMotion);
    },
    openExport() {
      renderExport(true);
      openDialog(exporter, reducedMotion);
    },
    openHelp() {
      openDialog(help, reducedMotion);
    },
  };
}
