export type ShapeId = 'vase' | 'bottle' | 'planter' | 'amphora' | 'bowl' | 'goblet';
export type ColorId = 'grafit' | 'biel' | 'piasek' | 'terakota' | 'szalwia' | 'granat' | 'miedz' | 'zloto';
export type FinishId = 'matte' | 'gloss' | 'metal' | 'glass';
export type SizeId = 's' | 'm' | 'l';
export type ExtraId = 'stand' | 'engraving' | 'gift';
export type EnvironmentId = 'studio' | 'gallery' | 'sunset' | 'neon';
export type Theme = 'light' | 'dark';

export interface Shape {
  id: ShapeId;
  name: string;
  model: string;
  slug: string;
  tagline: string;
  basePrice: number;
}

export interface Color {
  id: ColorId;
  name: string;
  hex: string;
  surcharge: number;
}

export interface Finish {
  id: FinishId;
  name: string;
  slug: string;
  description: string;
  surcharge: number;
}

export interface Size {
  id: SizeId;
  name: string;
  label: string;
  scale: number;
  surcharge: number;
}

export interface Extra {
  id: ExtraId;
  name: string;
  description: string;
  price: number;
}

export interface Config {
  shape: ShapeId;
  color: ColorId;
  finish: FinishId;
  size: SizeId;
  /** Always in catalog order, without duplicates. */
  extras: ExtraId[];
}

export const SHAPES: readonly Shape[] = [
  { id: 'vase', name: 'Wazon', model: 'Aura', slug: 'wazon', tagline: 'Miękki brzusiec i smukła szyjka', basePrice: 189 },
  { id: 'bottle', name: 'Butelka', model: 'Fala', slug: 'butelka', tagline: 'Prosta forma z wąskim gardłem', basePrice: 149 },
  { id: 'planter', name: 'Donica', model: 'Terra', slug: 'donica', tagline: 'Szeroki kołnierz, stabilna podstawa', basePrice: 169 },
  { id: 'amphora', name: 'Amfora', model: 'Ida', slug: 'amfora', tagline: 'Klasyczna sylwetka na wysokiej stopce', basePrice: 229 },
  { id: 'bowl', name: 'Misa', model: 'Luna', slug: 'misa', tagline: 'Płaska, szeroka czasza', basePrice: 129 },
  { id: 'goblet', name: 'Kielich', model: 'Sol', slug: 'kielich', tagline: 'Czasza na smukłej nóżce', basePrice: 159 },
];

export const COLORS: readonly Color[] = [
  { id: 'grafit', name: 'Grafit', hex: '#2f3542', surcharge: 0 },
  { id: 'biel', name: 'Biel', hex: '#eeeff2', surcharge: 0 },
  { id: 'piasek', name: 'Piasek', hex: '#d6c2a4', surcharge: 0 },
  { id: 'terakota', name: 'Terakota', hex: '#c8553d', surcharge: 0 },
  { id: 'szalwia', name: 'Szałwia', hex: '#7a9e7e', surcharge: 0 },
  { id: 'granat', name: 'Granat', hex: '#1f3a8a', surcharge: 0 },
  { id: 'miedz', name: 'Miedź', hex: '#b5643c', surcharge: 25 },
  { id: 'zloto', name: 'Złoto', hex: '#d4a437', surcharge: 25 },
];

export const FINISHES: readonly Finish[] = [
  { id: 'matte', name: 'Matowe', slug: 'matowe', description: 'Aksamitne szkliwo bez odblasków', surcharge: 0 },
  { id: 'gloss', name: 'Połysk', slug: 'polysk', description: 'Głęboka, lustrzana glazura', surcharge: 40 },
  { id: 'metal', name: 'Metal', slug: 'metal', description: 'Szczotkowany efekt metalu', surcharge: 90 },
  { id: 'glass', name: 'Szkło', slug: 'szklo', description: 'Barwione szkło dmuchane', surcharge: 120 },
];

export const SIZES: readonly Size[] = [
  { id: 's', name: 'S', label: 'Mały', scale: 0.84, surcharge: -30 },
  { id: 'm', name: 'M', label: 'Średni', scale: 1, surcharge: 0 },
  { id: 'l', name: 'L', label: 'Duży', scale: 1.16, surcharge: 60 },
];

export const EXTRAS: readonly Extra[] = [
  { id: 'stand', name: 'Podstawka dębowa', description: 'Toczona z litego dębu', price: 59 },
  { id: 'engraving', name: 'Grawer', description: 'Inicjały na stopce', price: 35 },
  { id: 'gift', name: 'Opakowanie prezentowe', description: 'Pudełko z bibułą', price: 19 },
];

export const DEFAULT_CONFIG: Config = { shape: 'vase', color: 'terakota', finish: 'matte', size: 'm', extras: [] };

export const VAT_RATE = 0.23;

const byId = <T extends { id: string }>(list: readonly T[], id: string): T | undefined => list.find((item) => item.id === id);

export const getShape = (id: ShapeId): Shape => byId(SHAPES, id) ?? SHAPES[0]!;
export const getColor = (id: ColorId): Color => byId(COLORS, id) ?? COLORS[0]!;
export const getFinish = (id: FinishId): Finish => byId(FINISHES, id) ?? FINISHES[0]!;
export const getSize = (id: SizeId): Size => byId(SIZES, id) ?? SIZES[1]!;
export const getExtra = (id: ExtraId): Extra => byId(EXTRAS, id) ?? EXTRAS[0]!;

/** Returns extras in catalog order without duplicates or unknown ids. */
export function normalizeExtras(extras: readonly string[]): ExtraId[] {
  return EXTRAS.filter((extra) => extras.includes(extra.id)).map((extra) => extra.id);
}

export function toggleExtra(config: Config, id: ExtraId): Config {
  const has = config.extras.includes(id);
  return { ...config, extras: normalizeExtras(has ? config.extras.filter((e) => e !== id) : [...config.extras, id]) };
}

export function sameConfig(a: Config, b: Config): boolean {
  return (
    a.shape === b.shape &&
    a.color === b.color &&
    a.finish === b.finish &&
    a.size === b.size &&
    a.extras.length === b.extras.length &&
    a.extras.every((e, i) => b.extras[i] === e)
  );
}

export interface PriceLine {
  id: string;
  label: string;
  detail: string;
  amount: number;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  total: number;
  vat: number;
}

/** Line items in display order. Zero-value options are left out, except the base product. */
export function priceBreakdown(config: Config): PriceBreakdown {
  const shape = getShape(config.shape);
  const color = getColor(config.color);
  const finish = getFinish(config.finish);
  const size = getSize(config.size);
  const lines: PriceLine[] = [{ id: 'base', label: `${shape.name} ${shape.model}`, detail: 'Cena bazowa', amount: shape.basePrice }];
  if (size.surcharge !== 0) lines.push({ id: 'size', label: `Rozmiar ${size.name}`, detail: size.label, amount: size.surcharge });
  if (finish.surcharge !== 0) lines.push({ id: 'finish', label: `Wykończenie: ${finish.name}`, detail: finish.description, amount: finish.surcharge });
  if (color.surcharge !== 0) lines.push({ id: 'color', label: `Kolor premium: ${color.name}`, detail: 'Pigment metaliczny', amount: color.surcharge });
  for (const id of normalizeExtras(config.extras)) {
    const extra = getExtra(id);
    lines.push({ id: `extra-${id}`, label: extra.name, detail: extra.description, amount: extra.price });
  }
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const vat = Math.round(total - total / (1 + VAT_RATE));
  return { lines, total, vat };
}

export function calculatePrice(config: Config): number {
  return priceBreakdown(config).total;
}

const priceFormat = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0, useGrouping: true });

/** "1 234 zł"; Polish grouping uses a non-breaking space, which we keep for layout. */
export function formatPrice(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '';
  return `${sign}${priceFormat.format(Math.abs(rounded))} zł`;
}

export function formatDelta(value: number): string {
  return value > 0 ? `+${formatPrice(value)}` : formatPrice(value);
}

export function productName(config: Config): string {
  const shape = getShape(config.shape);
  return `${shape.name} ${shape.model}`;
}

export function describe(config: Config): string {
  return [productName(config), getColor(config.color).name, getFinish(config.finish).name, `rozmiar ${getSize(config.size).name}`].join(' · ');
}

/** File name for a PNG export, ASCII only. */
export function fileName(config: Config, suffix = ''): string {
  const parts = [getShape(config.shape).slug, config.color, getFinish(config.finish).slug, config.size];
  return `konfigurator-3d-${parts.join('-')}${suffix ? `-${suffix}` : ''}.png`;
}

export const ENVIRONMENT_IDS: readonly EnvironmentId[] = ['studio', 'gallery', 'sunset', 'neon'];

export interface HashState {
  config: Config;
  env: EnvironmentId | null;
}

export function encodeHash(config: Config, env?: EnvironmentId): string {
  const params = [`shape=${config.shape}`, `color=${config.color}`, `finish=${config.finish}`, `size=${config.size}`];
  if (config.extras.length) params.push(`extras=${normalizeExtras(config.extras).join(',')}`);
  if (env) params.push(`env=${env}`);
  return params.join('&');
}

/** Colors of the first version, which stored a color index in the hash. */
const LEGACY_COLORS: readonly ColorId[] = ['grafit', 'biel', 'terakota', 'szalwia', 'granat', 'zloto'];
const LEGACY_FINISHES: Record<string, FinishId> = { matte: 'matte', gloss: 'gloss', metal: 'metal', glass: 'glass' };

function parseLegacy(raw: string): HashState | null {
  const parts = raw.split('-');
  if (parts.length !== 3) return null;
  const [shape, color, finish] = parts as [string, string, string];
  if (!['vase', 'bottle', 'planter'].includes(shape)) return null;
  if (!Object.hasOwn(LEGACY_FINISHES, finish)) return null;
  if (!/^\d$/.test(color)) return null;
  const colorId = LEGACY_COLORS[Number(color)];
  if (!colorId) return null;
  return { config: { ...DEFAULT_CONFIG, shape: shape as ShapeId, color: colorId, finish: LEGACY_FINISHES[finish]! }, env: null };
}

const KEYS = new Set(['shape', 'color', 'finish', 'size', 'extras', 'env']);
const isOneOf = (list: readonly { id: string }[], value: string) => list.some((item) => item.id === value);

/**
 * Parses "#shape=vase&color=terakota&finish=glass&size=m&extras=stand,gift&env=neon".
 * `shape` is required, other keys fall back to defaults. Any invalid value or unknown key returns null.
 * The first version's "#vase-2-glass" form is still accepted.
 */
export function decodeHash(hash: string): HashState | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  if (!raw.includes('=')) return parseLegacy(raw);

  const values = new Map<string, string>();
  for (const pair of raw.split('&')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) return null;
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (!KEYS.has(key) || values.has(key)) return null;
    values.set(key, value);
  }

  const shape = values.get('shape');
  if (!shape || !isOneOf(SHAPES, shape)) return null;
  const color = values.get('color') ?? DEFAULT_CONFIG.color;
  const finish = values.get('finish') ?? DEFAULT_CONFIG.finish;
  const size = values.get('size') ?? DEFAULT_CONFIG.size;
  if (!isOneOf(COLORS, color) || !isOneOf(FINISHES, finish) || !isOneOf(SIZES, size)) return null;

  let extras: ExtraId[] = [];
  const rawExtras = values.get('extras');
  if (rawExtras !== undefined) {
    const list = rawExtras.split(',');
    if (list.some((id) => !isOneOf(EXTRAS, id))) return null;
    extras = normalizeExtras(list);
  }

  const env = values.get('env');
  if (env !== undefined && !(ENVIRONMENT_IDS as readonly string[]).includes(env)) return null;

  return {
    config: { shape: shape as ShapeId, color: color as ColorId, finish: finish as FinishId, size: size as SizeId, extras },
    env: (env as EnvironmentId | undefined) ?? null,
  };
}

/** Validates an unknown value (e.g. from storage) as a Config. */
export function asConfig(value: unknown): Config | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const { shape, color, finish, size, extras } = v;
  if (typeof shape !== 'string' || !isOneOf(SHAPES, shape)) return null;
  if (typeof color !== 'string' || !isOneOf(COLORS, color)) return null;
  if (typeof finish !== 'string' || !isOneOf(FINISHES, finish)) return null;
  if (typeof size !== 'string' || !isOneOf(SIZES, size)) return null;
  if (!Array.isArray(extras) || extras.some((e) => typeof e !== 'string' || !isOneOf(EXTRAS, e))) return null;
  return { shape: shape as ShapeId, color: color as ColorId, finish: finish as FinishId, size: size as SizeId, extras: normalizeExtras(extras as string[]) };
}
