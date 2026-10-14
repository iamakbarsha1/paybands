import { describe, expect, it } from 'vitest';
import { compRatio, money, type PayBand } from './index';

/** The shape the seed writes: min and max at 80% and 120% of a stored midpoint. */
function bandAround(midMinor: bigint, currency: string): PayBand {
  return {
    min: money((midMinor * 80n) / 100n, currency),
    mid: money(midMinor, currency),
    max: money((midMinor * 120n) / 100n, currency),
  };
}

const GBP_BAND = bandAround(6_000_000n, 'GBP');

describe('compRatio', () => {
  it('returns 1 for a salary sitting on the midpoint', () => {
    expect(compRatio(money(6_000_000n, 'GBP'), GBP_BAND)).toBe(1);
  });

  it('returns 0.8 for a salary 20% below the midpoint', () => {
    expect(compRatio(money(4_800_000n, 'GBP'), GBP_BAND)).toBe(0.8);
  });

  it('returns 1.2 for a salary 20% above the midpoint', () => {
    expect(compRatio(money(7_200_000n, 'GBP'), GBP_BAND)).toBe(1.2);
  });

  it('returns null for an employee with no band, rather than zero', () => {
    expect(compRatio(money(6_000_000n, 'GBP'), undefined)).toBeNull();
  });

  it('is scale-free, so a currency with no minor unit needs no correction', () => {
    // ¥6,800,000 is the seeded L1 midpoint for Japan. Unlike toUsd, nothing here
    // is quoted between major units, so applying a minor-unit factor would be wrong.
    expect(compRatio(money(7_140_000n, 'JPY'), bandAround(6_800_000n, 'JPY'))).toBe(1.05);
  });

  it('keeps every digit of a ratio that does not terminate', () => {
    // Guards decision 37: a fixed-point division would return 0.333333 here.
    expect(compRatio(money(2_000_000n, 'GBP'), GBP_BAND)).toBe(1 / 3);
  });

  it('computes above Number.MAX_SAFE_INTEGER rather than refusing the amount', () => {
    const big = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(compRatio(money(big * 2n, 'GBP'), bandAround(big, 'GBP'))).toBe(2);
  });
});

describe('compRatio refusals', () => {
  it('refuses a salary and a band in different currencies rather than converting', () => {
    expect(() => compRatio(money(6_000_000n, 'GBP'), bandAround(6_000_000n, 'USD'))).toThrow(
      /GBP salary against a USD band/,
    );
  });

  it('throws on a midpoint of zero rather than returning Infinity', () => {
    expect(() => compRatio(money(6_000_000n, 'GBP'), bandAround(0n, 'GBP'))).toThrow(RangeError);
  });

  it('throws on a negative midpoint rather than returning a plausible ratio', () => {
    expect(() => compRatio(money(6_000_000n, 'GBP'), bandAround(-6_000_000n, 'GBP'))).toThrow(
      RangeError,
    );
  });
});
