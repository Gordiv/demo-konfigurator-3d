export type ShapeId = 'vase' | 'bottle' | 'planter';
export type FinishId = 'matte' | 'gloss' | 'metal' | 'glass';
export type Theme = 'light' | 'dark';

export interface Shape {
  id: ShapeId;
  name: string;
  slug: string;
  basePrice: number;
}

export interface Color {
  name: string;
  slug: string;
  hex: string;
}

export interface Finish {
  id: FinishId;
  name: string;
  slug: string;
  surcharge: number;
}

/** A product configuration. `color` is an index into COLORS. */
export interface Config {
  shape: ShapeId;
  color: number;
  finish: FinishId;
}

export const SHAPES: readonly Shape[] = [
  { id: 'vase', name: 'Wazon', slug: 'wazon', basePrice: 189 },
  { id: 'bottle', name: 'Butelka', slug: 'butelka', basePrice: 149 },
  { id: 'planter', name: 'Donica', slug: 'donica', basePrice: 169 },
];

export const COLORS: readonly Color[] = [
  { name: 'Grafit', slug: 'grafit', hex: '#2f3542' },
  { name: 'Biel', slug: 'biel', hex: '#f1f2f6' },
  { name: 'Terakota', slug: 'terakota', hex: '#c8553d' },
  { name: 'Szałwia', slug: 'szalwia', hex: '#7a9e7e' },
  { name: 'Granat', slug: 'granat', hex: '#1e3a8a' },
  { name: 'Złoto', slug: 'zloto', hex: '#d4a437' },
];

export const FINISHES: readonly Finish[] = [
  { id: 'matte', name: 'Matowe', slug: 'matowe', surcharge: 0 },
  { id: 'gloss', name: 'Błyszczące', slug: 'blyszczace', surcharge: 40 },
  { id: 'metal', name: 'Metaliczne', slug: 'metaliczne', surcharge: 90 },
  { id: 'glass', name: 'Szklane', slug: 'szklane', surcharge: 120 },
];

export const DEFAULT_CONFIG: Config = { shape: 'vase', color: 2, finish: 'matte' };

export function getShape(id: ShapeId): Shape {
  return SHAPES.find((s) => s.id === id) ?? SHAPES[0]!;
}

export function getFinish(id: FinishId): Finish {
  return FINISHES.find((f) => f.id === id) ?? FINISHES[0]!;
}

export function getColor(index: number): Color {
  return COLORS[index] ?? COLORS[0]!;
}

export function calculatePrice(config: Config): number {
  return getShape(config.shape).basePrice + getFinish(config.finish).surcharge;
}

const priceFormat = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });

export function formatPrice(value: number): string {
  return `${priceFormat.format(value)} zł`;
}

export function describe(config: Config): string {
  return [getShape(config.shape).name, getColor(config.color).name, getFinish(config.finish).name].join(' · ');
}

/** File name for the PNG snapshot, ASCII only. */
export function fileName(config: Config): string {
  const parts = [getShape(config.shape).slug, getColor(config.color).slug, getFinish(config.finish).slug];
  return `konfigurator-3d-${parts.join('-')}.png`;
}

export function serializeHash(config: Config): string {
  return `${config.shape}-${config.color}-${config.finish}`;
}

/** Parses a location hash like "#vase-2-glass". Returns null for anything invalid. */
export function parseHash(hash: string): Config | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const parts = raw.split('-');
  if (parts.length !== 3) return null;
  const [shape, color, finish] = parts as [string, string, string];

  if (!SHAPES.some((s) => s.id === shape)) return null;
  if (!FINISHES.some((f) => f.id === finish)) return null;
  if (!/^\d{1,2}$/.test(color)) return null;
  const index = Number(color);
  if (index >= COLORS.length) return null;

  return { shape: shape as ShapeId, color: index, finish: finish as FinishId };
}
