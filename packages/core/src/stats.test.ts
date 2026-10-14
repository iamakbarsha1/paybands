import { describe, expect, it } from 'vitest';
import { money, percentiles, type Money } from './index';

function gbp(...minor: bigint[]): Money[] {
  return minor.map((amount) => money(amount, 'GBP'));
}

/** £100, £200, £300, £400. NumPy returns 175, 250, 325, 370 for these points. */
const FOUR = gbp(10_000n, 20_000n, 30_000n, 40_000n);

describe('percentiles', () => {
  it('matches the documented method on a worked four-value example', () => {
    expect(percentiles(FOUR, [25, 50, 75, 90])).toEqual([
      { p: 25, value: money(17_500n, 'GBP') },
      { p: 50, value: money(25_000n, 'GBP') },
      { p: 75, value: money(32_500n, 'GBP') },
      { p: 90, value: money(37_000n, 'GBP') },
    ]);
  });

  it('returns null for an empty group rather than zeros', () => {
    expect(percentiles([], [50])).toBeNull();
  });

  it('returns the only salary for every point in a group of one', () => {
    expect(percentiles(gbp(42_000n), [0, 25, 50, 100])).toEqual([
      { p: 0, value: money(42_000n, 'GBP') },
      { p: 25, value: money(42_000n, 'GBP') },
      { p: 50, value: money(42_000n, 'GBP') },
      { p: 100, value: money(42_000n, 'GBP') },
    ]);
  });

  it('averages the two middle salaries for p50 of an even group', () => {
    expect(percentiles(gbp(10_000n, 20_000n), [50])).toEqual([
      { p: 50, value: money(15_000n, 'GBP') },
    ]);
  });

  it('takes the middle salary for p50 of an odd group, without interpolating', () => {
    expect(percentiles(gbp(10_000n, 20_000n, 30_000n), [50])).toEqual([
      { p: 50, value: money(20_000n, 'GBP') },
    ]);
  });

  it('returns the same salary for every point when the group is all equal', () => {
    expect(percentiles(gbp(50_000n, 50_000n, 50_000n), [25, 50, 90])).toEqual([
      { p: 25, value: money(50_000n, 'GBP') },
      { p: 50, value: money(50_000n, 'GBP') },
      { p: 90, value: money(50_000n, 'GBP') },
    ]);
  });

  it('sorts the group, so the caller’s ordering does not change the answer', () => {
    const shuffled = gbp(40_000n, 10_000n, 30_000n, 20_000n);
    expect(percentiles(shuffled, [25, 50, 75, 90])).toEqual(percentiles(FOUR, [25, 50, 75, 90]));
  });

  it('leaves the caller’s array in the order it arrived', () => {
    const shuffled = gbp(40_000n, 10_000n, 30_000n, 20_000n);
    percentiles(shuffled, [50]);
    expect(shuffled.map((salary) => salary.amount)).toEqual([40_000n, 10_000n, 30_000n, 20_000n]);
  });

  it('puts p0 at the minimum and p100 at the maximum', () => {
    expect(percentiles(FOUR, [0, 100])).toEqual([
      { p: 0, value: money(10_000n, 'GBP') },
      { p: 100, value: money(40_000n, 'GBP') },
    ]);
  });

  it('returns the points in the order they were asked for', () => {
    const asked = percentiles(FOUR, [90, 25]);
    expect(asked?.map((entry) => entry.p)).toEqual([90, 25]);
  });

  it('carries the group’s currency through to the result', () => {
    const yen = [money(6_800_000n, 'JPY'), money(7_140_000n, 'JPY')];
    expect(percentiles(yen, [50])).toEqual([{ p: 50, value: money(6_970_000n, 'JPY') }]);
  });
});

describe('percentile rounding', () => {
  it('rounds an interpolated tie away from zero', () => {
    expect(percentiles(gbp(0n, 1n), [50])).toEqual([{ p: 50, value: money(1n, 'GBP') }]);
  });

  it('rounds down below the halfway point', () => {
    expect(percentiles(gbp(0n, 1n), [25])).toEqual([{ p: 25, value: money(0n, 'GBP') }]);
  });

  it('interpolates in whole minor units, never in floating point', () => {
    // 2^53 + 1 is not a double. Interpolating through number would return the floor.
    const floor = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(percentiles(gbp(floor, floor + 4n), [50])).toEqual([
      { p: 50, value: money(floor + 2n, 'GBP') },
    ]);
  });
});

describe('percentile refusals', () => {
  it('throws on a fractional point', () => {
    expect(() => percentiles(FOUR, [33.3])).toThrow(RangeError);
  });

  it('throws on a point above 100', () => {
    expect(() => percentiles(FOUR, [101])).toThrow(RangeError);
  });

  it('throws on a negative point', () => {
    expect(() => percentiles(FOUR, [-1])).toThrow(RangeError);
  });

  it('refuses a group holding more than one currency', () => {
    const mixed = [money(10_000n, 'GBP'), money(20_000n, 'USD')];
    // Which way round the comparator sees them is up to the sort, so match the rule, not the pair.
    expect(() => percentiles(mixed, [50])).toThrow(/Cannot combine .* without an FX rate/);
  });
});
