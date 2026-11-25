import { describe as group, expect, it } from 'vitest';
import {
  COLORS,
  DEFAULT_CONFIG,
  EXTRAS,
  FINISHES,
  SHAPES,
  SIZES,
  asConfig,
  calculatePrice,
  decodeHash,
  describe,
  encodeHash,
  fileName,
  formatDelta,
  formatPrice,
  normalizeExtras,
  priceBreakdown,
  sameConfig,
  toggleExtra,
  type Config,
} from '../src/config';

const nbsp = (s: string) => s.replace(/ /g, ' ');
const cfg = (patch: Partial<Config> = {}): Config => ({ ...DEFAULT_CONFIG, ...patch });

group('catalog', () => {
  it('has six products with their own base price', () => {
    expect(SHAPES).toHaveLength(6);
    expect(new Set(SHAPES.map((s) => s.id)).size).toBe(6);
    expect(new Set(SHAPES.map((s) => s.basePrice)).size).toBe(6);
  });

  it('keeps the default configuration valid', () => {
    expect(asConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });
});

group('priceBreakdown', () => {
  it('starts with the base price and leaves out free options', () => {
    const b = priceBreakdown(cfg({ shape: 'vase' }));
    expect(b.lines.map((l) => l.id)).toEqual(['base']);
    expect(b.total).toBe(189);
  });

  it('adds size, finish, premium color and extras as line items', () => {
    const b = priceBreakdown({ shape: 'amphora', color: 'zloto', finish: 'glass', size: 'l', extras: ['gift', 'stand'] });
    expect(b.lines.map((l) => [l.id, l.amount])).toEqual([
      ['base', 229],
      ['size', 60],
      ['finish', 120],
      ['color', 25],
      ['extra-stand', 59],
      ['extra-gift', 19],
    ]);
    expect(b.total).toBe(229 + 60 + 120 + 25 + 59 + 19);
  });

  it('applies the discount of the small size', () => {
    expect(calculatePrice(cfg({ shape: 'bowl', size: 's' }))).toBe(129 - 30);
  });

  it('total always equals the sum of lines', () => {
    for (const shape of SHAPES)
      for (const finish of FINISHES)
        for (const size of SIZES) {
          const b = priceBreakdown({ shape: shape.id, color: 'miedz', finish: finish.id, size: size.id, extras: EXTRAS.map((e) => e.id) });
          expect(b.total).toBe(b.lines.reduce((s, l) => s + l.amount, 0));
          expect(b.total).toBe(shape.basePrice + finish.surcharge + size.surcharge + 25 + 59 + 35 + 19);
        }
  });

  it('computes the VAT included in the gross total', () => {
    expect(priceBreakdown(cfg({ shape: 'vase' })).vat).toBe(Math.round(189 - 189 / 1.23));
  });

  it('only premium colors change the price', () => {
    const prices = COLORS.map((c) => calculatePrice(cfg({ color: c.id })));
    expect(prices.filter((p) => p !== 189)).toEqual([214, 214]);
  });
});

group('formatting', () => {
  it('formats prices in złoty with Polish grouping', () => {
    expect(formatPrice(309)).toBe('309 zł');
    expect(nbsp(formatPrice(12345))).toBe('12 345 zł');
  });

  it('formats signed deltas', () => {
    expect(formatDelta(40)).toBe('+40 zł');
    expect(formatDelta(-30)).toBe('−30 zł');
  });

  it('describes a configuration in Polish', () => {
    expect(describe(cfg({ shape: 'vase', color: 'terakota', finish: 'glass' }))).toBe('Wazon Aura · Terakota · Szkło · rozmiar M');
  });

  it('builds an ASCII file name', () => {
    expect(fileName(cfg({ shape: 'planter', color: 'szalwia', finish: 'gloss', size: 'l' }))).toBe('konfigurator-3d-donica-szalwia-polysk-l.png');
    expect(fileName(cfg(), 'przezroczyste')).toBe('konfigurator-3d-wazon-terakota-matowe-m-przezroczyste.png');
  });
});

group('extras', () => {
  it('normalizes to catalog order without duplicates or unknown ids', () => {
    expect(normalizeExtras(['gift', 'stand', 'gift', 'nope'])).toEqual(['stand', 'gift']);
  });

  it('toggles an extra on and off', () => {
    const on = toggleExtra(cfg(), 'engraving');
    expect(on.extras).toEqual(['engraving']);
    expect(toggleExtra(on, 'engraving').extras).toEqual([]);
  });

  it('compares configurations by value', () => {
    expect(sameConfig(cfg({ extras: ['stand'] }), cfg({ extras: ['stand'] }))).toBe(true);
    expect(sameConfig(cfg({ extras: ['stand'] }), cfg({ extras: ['gift'] }))).toBe(false);
    expect(sameConfig(cfg(), cfg({ size: 'l' }))).toBe(false);
  });
});

group('hash', () => {
  it('encodes a configuration', () => {
    expect(encodeHash(cfg({ shape: 'vase', finish: 'glass', extras: ['stand', 'gift'] }), 'neon')).toBe(
      'shape=vase&color=terakota&finish=glass&size=m&extras=stand,gift&env=neon',
    );
    expect(encodeHash(cfg())).toBe('shape=vase&color=terakota&finish=matte&size=m');
  });

  it('round-trips every shape, color, finish and size', () => {
    for (const shape of SHAPES)
      for (const color of COLORS)
        for (const finish of FINISHES)
          for (const size of SIZES) {
            const config: Config = { shape: shape.id, color: color.id, finish: finish.id, size: size.id, extras: ['engraving'] };
            expect(decodeHash(`#${encodeHash(config, 'sunset')}`)).toEqual({ config, env: 'sunset' });
          }
  });

  it('fills missing keys with defaults', () => {
    expect(decodeHash('#shape=bowl')).toEqual({ config: cfg({ shape: 'bowl' }), env: null });
  });

  it('still opens links of the first version', () => {
    expect(decodeHash('#vase-2-glass')).toEqual({ config: cfg({ shape: 'vase', color: 'terakota', finish: 'glass' }), env: null });
    expect(decodeHash('bottle-5-metal')?.config.color).toBe('zloto');
  });

  it.each([
    '',
    '#',
    '#vase',
    '#vase-6-glass',
    '#cup-2-glass',
    '#shape=cup',
    '#color=biel',
    '#shape=vase&color=róż',
    '#shape=vase&finish=wood',
    '#shape=vase&size=xl',
    '#shape=vase&extras=stand,laser',
    '#shape=vase&env=space',
    '#shape=vase&shape=bowl',
    '#shape=vase&foo=1',
    '#shape=__proto__',
    '#shape=constructor',
    '#shape=vase&=x',
    '#SHAPE=vase',
    '#shape=vase&extras=',
  ])('rejects invalid input %j', (hash) => {
    expect(decodeHash(hash)).toBeNull();
  });
});

group('asConfig', () => {
  it('rejects malformed stored data', () => {
    expect(asConfig(null)).toBeNull();
    expect(asConfig({ ...DEFAULT_CONFIG, shape: 'cup' })).toBeNull();
    expect(asConfig({ ...DEFAULT_CONFIG, extras: 'stand' })).toBeNull();
    expect(asConfig({ ...DEFAULT_CONFIG, extras: [1] })).toBeNull();
  });

  it('normalizes extras order', () => {
    expect(asConfig({ ...DEFAULT_CONFIG, extras: ['gift', 'stand'] })?.extras).toEqual(['stand', 'gift']);
  });
});
