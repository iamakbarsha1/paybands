import { describe, expect, it } from 'vitest';
import { money, toUsd, type FxRate } from './index';

/** The shape the seed writes: two periods per currency sharing a boundary date. */
const PERIOD_TWO_FROM = new Date(Date.UTC(2024, 0, 1));
const PERIOD_ONE_FROM = new Date(Date.UTC(2014, 0, 1));

const RATES: FxRate[] = [
  {
    currency: 'GBP',
    rateToUsdMicros: 1_380_000,
    effectiveFrom: PERIOD_ONE_FROM,
    effectiveTo: PERIOD_TWO_FROM,
  },
  {
    currency: 'GBP',
    rateToUsdMicros: 1_270_000,
    effectiveFrom: PERIOD_TWO_FROM,
    effectiveTo: null,
  },
  {
    currency: 'JPY',
    rateToUsdMicros: 6_700,
    effectiveFrom: PERIOD_ONE_FROM,
    effectiveTo: null,
  },
  {
    currency: 'USD',
    rateToUsdMicros: 1_000_000,
    effectiveFrom: PERIOD_ONE_FROM,
    effectiveTo: null,
  },
];

const IN_PERIOD_TWO = new Date(Date.UTC(2024, 5, 1));
const IN_PERIOD_ONE = new Date(Date.UTC(2023, 11, 31));

describe('toUsd', () => {
  it('converts at the rate open on that date', () => {
    expect(toUsd(money(100_000n, 'GBP'), RATES, IN_PERIOD_TWO)).toEqual(money(127_000n, 'USD'));
  });

  it('uses the earlier rate for a date inside the earlier period', () => {
    expect(toUsd(money(100_000n, 'GBP'), RATES, IN_PERIOD_ONE)).toEqual(money(138_000n, 'USD'));
  });

  it('scales a currency with no minor unit, so JPY is not off by a factor of 100', () => {
    // ¥6,800,000 is the seeded L1 midpoint for Japan. At 6_700 micros that is $45,560.
    const converted = toUsd(money(6_800_000n, 'JPY'), RATES, IN_PERIOD_TWO);
    expect(converted).toEqual(money(4_556_000n, 'USD'));
    expect(converted.amount).not.toBe(45_560n);
  });

  it('gives the boundary date to the later period', () => {
    expect(toUsd(money(100_000n, 'GBP'), RATES, PERIOD_TWO_FROM)).toEqual(money(127_000n, 'USD'));
  });

  it('gives the day before the boundary to the earlier period', () => {
    const dayBefore = new Date(Date.UTC(2023, 11, 31));
    expect(toUsd(money(100_000n, 'GBP'), RATES, dayBefore)).toEqual(money(138_000n, 'USD'));
  });

  it('matches the first day of an open-ended period', () => {
    expect(toUsd(money(100_000n, 'GBP'), RATES, PERIOD_ONE_FROM)).toEqual(money(138_000n, 'USD'));
  });

  it('returns a USD amount unchanged through the identity rate', () => {
    expect(toUsd(money(123_456n, 'USD'), RATES, IN_PERIOD_TWO)).toEqual(money(123_456n, 'USD'));
  });

  it('throws for a date before the earliest rate rather than reaching for the nearest one', () => {
    const beforeAnyRate = new Date(Date.UTC(2013, 6, 1));
    expect(() => toUsd(money(100_000n, 'GBP'), RATES, beforeAnyRate)).toThrow(RangeError);
  });

  it('throws when the table carries no rate for that currency', () => {
    expect(() => toUsd(money(100_000n, 'SGD'), RATES, IN_PERIOD_TWO)).toThrow(RangeError);
  });

  it('throws on an empty rate table rather than returning the amount unconverted', () => {
    expect(() => toUsd(money(100_000n, 'GBP'), [], IN_PERIOD_TWO)).toThrow(RangeError);
  });

  it('ignores a rate belonging to another currency', () => {
    const jpyOnly = RATES.filter((rate) => rate.currency === 'JPY');
    expect(() => toUsd(money(100_000n, 'GBP'), jpyOnly, IN_PERIOD_TWO)).toThrow(RangeError);
  });
});

describe('toUsd rounding', () => {
  const EUR_HALF_CENT: FxRate = {
    currency: 'EUR',
    rateToUsdMicros: 1_500_000,
    effectiveFrom: PERIOD_ONE_FROM,
    effectiveTo: null,
  };
  const HALF_CENT: FxRate[] = [EUR_HALF_CENT];
  const onDate = IN_PERIOD_TWO;

  it('rounds a tie away from zero', () => {
    expect(toUsd(money(1n, 'EUR'), HALF_CENT, onDate).amount).toBe(2n);
  });

  it('rounds a negative tie away from zero, so the sign is symmetric', () => {
    expect(toUsd(money(-1n, 'EUR'), HALF_CENT, onDate).amount).toBe(-2n);
  });

  it('rounds down below the halfway point', () => {
    const justUnder: FxRate[] = [{ ...EUR_HALF_CENT, rateToUsdMicros: 1_499_999 }];
    expect(toUsd(money(1n, 'EUR'), justUnder, onDate).amount).toBe(1n);
  });

  it('divides once, so a large amount keeps every unit', () => {
    const exact: FxRate[] = [{ ...EUR_HALF_CENT, rateToUsdMicros: 2_000_000 }];
    const big = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(toUsd(money(big, 'EUR'), exact, onDate).amount).toBe(big * 2n);
  });
});
