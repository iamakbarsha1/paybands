import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES, GENDERS, isCurrencyCode, minorUnitsFor } from './index';

describe('minorUnitsFor', () => {
  it('returns two decimal places for a currency that has them', () => {
    expect(minorUnitsFor('USD')).toBe(2);
  });

  it('returns zero for JPY, which has no minor unit', () => {
    expect(minorUnitsFor('JPY')).toBe(0);
  });

  it('throws on an unknown currency rather than assuming two decimal places', () => {
    expect(() => minorUnitsFor('XYZ')).toThrow(RangeError);
  });

  it('covers every currency code the table exposes', () => {
    for (const code of CURRENCY_CODES) {
      expect(minorUnitsFor(code)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('isCurrencyCode', () => {
  it('rejects a string that is not a currency', () => {
    expect(isCurrencyCode('nope')).toBe(false);
  });

  it('does not treat inherited object properties as currencies', () => {
    expect(isCurrencyCode('toString')).toBe(false);
    expect(isCurrencyCode('constructor')).toBe(false);
  });
});

describe('GENDERS', () => {
  it('includes an explicit undisclosed value so the gap report can exclude it deliberately', () => {
    expect(GENDERS).toContain('undisclosed');
  });
});
