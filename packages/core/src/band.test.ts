import { describe, expect, it } from 'vitest';
import { bandSpread, compRatio, money, rangePenetration, type PayBand } from './index';

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

describe('rangePenetration', () => {
  it('returns 0 at the band minimum', () => {
    expect(rangePenetration(money(4_800_000n, 'GBP'), GBP_BAND)).toBe(0);
  });

  it('returns 1 at the band maximum', () => {
    expect(rangePenetration(money(7_200_000n, 'GBP'), GBP_BAND)).toBe(1);
  });

  it('returns 0.5 halfway up the band', () => {
    expect(rangePenetration(money(6_000_000n, 'GBP'), GBP_BAND)).toBe(0.5);
  });

  it('goes negative below the minimum rather than clamping to 0', () => {
    expect(rangePenetration(money(4_200_000n, 'GBP'), GBP_BAND)).toBe(-0.25);
  });

  it('goes past 1 above the maximum rather than clamping', () => {
    expect(rangePenetration(money(7_800_000n, 'GBP'), GBP_BAND)).toBe(1.25);
  });

  it('returns null for an employee with no band, rather than zero', () => {
    expect(rangePenetration(money(6_000_000n, 'GBP'), undefined)).toBeNull();
  });

  it('subtracts before converting, so a salary one unit above a huge minimum is not lost', () => {
    // Number(2^53 + 1) rounds to 2^53, so converting first would make this 0.
    const floor = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const band: PayBand = {
      min: money(floor, 'GBP'),
      mid: money(floor + 2n, 'GBP'),
      max: money(floor + 4n, 'GBP'),
    };
    expect(rangePenetration(money(floor + 1n, 'GBP'), band)).toBe(0.25);
  });
});

describe('rangePenetration refusals', () => {
  it('refuses a salary and a band in different currencies rather than converting', () => {
    expect(() => rangePenetration(money(6_000_000n, 'GBP'), bandAround(6_000_000n, 'USD'))).toThrow(
      /GBP salary against a USD band/,
    );
  });

  it('throws on a zero-width band rather than swallowing the divide by zero', () => {
    const flat = money(6_000_000n, 'GBP');
    expect(() => rangePenetration(flat, { min: flat, mid: flat, max: flat })).toThrow(RangeError);
  });

  it('throws on an inverted band rather than returning a backwards position', () => {
    const inverted: PayBand = {
      min: money(7_200_000n, 'GBP'),
      mid: money(6_000_000n, 'GBP'),
      max: money(4_800_000n, 'GBP'),
    };
    expect(() => rangePenetration(money(6_000_000n, 'GBP'), inverted)).toThrow(RangeError);
  });
});

describe('bandSpread', () => {
  it('is 0.5 for a band whose maximum is half again its minimum', () => {
    const band: PayBand = {
      min: money(4_000_000n, 'GBP'),
      mid: money(5_000_000n, 'GBP'),
      max: money(6_000_000n, 'GBP'),
    };

    expect(bandSpread(band)).toBe(0.5);
  });

  it('is 0.5 for the 80/120 band the seed writes, whatever the midpoint', () => {
    expect(bandSpread(bandAround(6_000_000n, 'GBP'))).toBeCloseTo(0.5, 10);
    expect(bandSpread(bandAround(90_000_000n, 'JPY'))).toBeCloseTo(0.5, 10);
  });

  it('measures against the minimum, not the midpoint', () => {
    // A band 4,000,000 wide: half of the 8,000,000 minimum, two fifths of the midpoint.
    const band: PayBand = {
      min: money(8_000_000n, 'GBP'),
      mid: money(10_000_000n, 'GBP'),
      max: money(12_000_000n, 'GBP'),
    };

    expect(bandSpread(band)).toBe(0.5);
  });

  it('refuses a band with no width rather than reporting a spread of nothing', () => {
    const flat: PayBand = {
      min: money(5_000_000n, 'GBP'),
      mid: money(5_000_000n, 'GBP'),
      max: money(5_000_000n, 'GBP'),
    };

    expect(() => bandSpread(flat)).toThrow(RangeError);
  });

  it('refuses a band whose minimum is not positive, which would divide by zero', () => {
    const zero: PayBand = {
      min: money(0n, 'GBP'),
      mid: money(2_500_000n, 'GBP'),
      max: money(5_000_000n, 'GBP'),
    };

    expect(() => bandSpread(zero)).toThrow(RangeError);
  });
});
