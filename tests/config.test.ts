import { describe as group, expect, it } from 'vitest';
import {
  COLORS,
  DEFAULT_CONFIG,
  FINISHES,
  SHAPES,
  calculatePrice,
  describe,
  fileName,
  formatPrice,
  parseHash,
  serializeHash,
  type Config,
} from '../src/config';

group('calculatePrice', () => {
  it('adds the finish surcharge to the shape base price', () => {
    expect(calculatePrice({ shape: 'vase', color: 2, finish: 'glass' })).toBe(309);
    expect(calculatePrice({ shape: 'bottle', color: 0, finish: 'matte' })).toBe(149);
    expect(calculatePrice({ shape: 'planter', color: 5, finish: 'gloss' })).toBe(209);
    expect(calculatePrice({ shape: 'planter', color: 1, finish: 'metal' })).toBe(259);
  });

  it('does not depend on the color', () => {
    const prices = COLORS.map((_, color) => calculatePrice({ shape: 'vase', color, finish: 'matte' }));
    expect(new Set(prices)).toEqual(new Set([189]));
  });

  it('covers every shape and finish combination', () => {
    for (const shape of SHAPES) {
      for (const finish of FINISHES) {
        expect(calculatePrice({ shape: shape.id, color: 0, finish: finish.id })).toBe(shape.basePrice + finish.surcharge);
      }
    }
  });
});

group('formatting', () => {
  it('formats prices in złoty', () => {
    expect(formatPrice(309)).toBe('309 zł');
  });

  it('describes a configuration in Polish', () => {
    expect(describe({ shape: 'vase', color: 2, finish: 'glass' })).toBe('Wazon · Terakota · Szklane');
  });

  it('builds an ASCII file name', () => {
    expect(fileName({ shape: 'planter', color: 3, finish: 'gloss' })).toBe('konfigurator-3d-donica-szalwia-blyszczace.png');
  });
});

group('hash', () => {
  it('serializes a configuration', () => {
    expect(serializeHash({ shape: 'vase', color: 2, finish: 'glass' })).toBe('vase-2-glass');
  });

  it('parses a hash with or without the leading #', () => {
    expect(parseHash('#vase-2-glass')).toEqual({ shape: 'vase', color: 2, finish: 'glass' });
    expect(parseHash('bottle-0-metal')).toEqual({ shape: 'bottle', color: 0, finish: 'metal' });
  });

  it('round-trips every configuration', () => {
    for (const shape of SHAPES) {
      for (const finish of FINISHES) {
        COLORS.forEach((_, color) => {
          const config: Config = { shape: shape.id, color, finish: finish.id };
          expect(parseHash(`#${serializeHash(config)}`)).toEqual(config);
        });
      }
    }
  });

  it.each([
    '',
    '#',
    '#vase',
    '#vase-2',
    '#vase-2-glass-extra',
    '#cup-2-glass',
    '#vase-2-wood',
    '#vase-6-glass',
    '#vase--1-glass',
    '#vase-1.5-glass',
    '#vase-x-glass',
    '#vase- 2-glass',
    '#vase-02x-glass',
    '#VASE-2-GLASS',
    '#vase-999-glass',
    '#__proto__-0-matte',
    '#constructor-0-matte',
  ])('rejects invalid input %j', (hash) => {
    expect(parseHash(hash)).toBeNull();
  });

  it('keeps the default configuration valid', () => {
    expect(parseHash(serializeHash(DEFAULT_CONFIG))).toEqual(DEFAULT_CONFIG);
  });
});
