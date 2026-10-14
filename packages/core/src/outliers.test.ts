import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMP_RATIO_THRESHOLD,
  money,
  outliers,
  type BandedSalary,
  type PayBand,
} from './index';

/** The seed's shape: min and max at 80% and 120% of the stored midpoint. */
const BAND: PayBand = {
  min: money(4_800_000n, 'GBP'),
  mid: money(6_000_000n, 'GBP'),
  max: money(7_200_000n, 'GBP'),
};

function row(employeeId: number, amount: bigint): BandedSalary {
  return { employeeId, salary: money(amount, 'GBP'), band: BAND };
}

/** Its own helper, because passing `undefined` to a defaulted parameter takes the default. */
function unbanded(employeeId: number, amount: bigint): BandedSalary {
  return { employeeId, salary: money(amount, 'GBP'), band: undefined };
}

function ids(entries: readonly { employeeId: number }[]): number[] {
  return entries.map((entry) => entry.employeeId);
}

describe('outliers', () => {
  it('finds a salary under the band minimum', () => {
    const found = outliers([row(1, 4_000_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(ids(found.belowBand)).toEqual([1]);
    expect(found.aboveBand).toEqual([]);
  });

  it('finds a salary over the band maximum', () => {
    const found = outliers([row(2, 8_000_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(ids(found.aboveBand)).toEqual([2]);
    expect(found.belowBand).toEqual([]);
  });

  it('leaves a salary sitting exactly on the minimum out of the below-band list', () => {
    const found = outliers([row(3, 4_800_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(found.belowBand).toEqual([]);
  });

  it('leaves a salary sitting exactly on the maximum out of the above-band list', () => {
    const found = outliers([row(4, 7_200_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(found.aboveBand).toEqual([]);
  });

  it('puts an employee with no band in its own list rather than dropping them', () => {
    const found = outliers([unbanded(5, 6_000_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(ids(found.noBand)).toEqual([5]);
    expect(found.belowBand).toEqual([]);
    expect(found.aboveBand).toEqual([]);
    expect(found.compRatioOutOfRange).toEqual([]);
  });

  it('returns four empty lists for an empty group', () => {
    expect(outliers([], DEFAULT_COMP_RATIO_THRESHOLD)).toEqual({
      belowBand: [],
      aboveBand: [],
      compRatioOutOfRange: [],
      noBand: [],
    });
  });

  it('reports a salary outside the band under both conditions it meets', () => {
    // Below the minimum is also below a 0.80 comp ratio, and the glossary reports
    // the three conditions separately rather than merging them into one count.
    const found = outliers([row(6, 4_000_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(ids(found.belowBand)).toEqual([6]);
    expect(ids(found.compRatioOutOfRange)).toEqual([6]);
  });

  it('carries the comp ratio through for the report to show', () => {
    const found = outliers([row(7, 3_000_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(found.belowBand[0]?.compRatio).toBe(0.5);
  });

  it('leaves the comp ratio null for an employee with no band', () => {
    const found = outliers([unbanded(8, 6_000_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(found.noBand[0]?.compRatio).toBeNull();
  });

  it('keeps an in-band salary out of every list', () => {
    const found = outliers([row(9, 6_000_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(found).toEqual({
      belowBand: [],
      aboveBand: [],
      compRatioOutOfRange: [],
      noBand: [],
    });
  });
});

describe('outlier comp ratio threshold', () => {
  it('leaves a comp ratio exactly on the lower bound in range', () => {
    const found = outliers([row(10, 4_800_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(found.compRatioOutOfRange).toEqual([]);
  });

  it('leaves a comp ratio exactly on the upper bound in range', () => {
    const found = outliers([row(11, 7_200_000n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(found.compRatioOutOfRange).toEqual([]);
  });

  it('catches a comp ratio one minor unit past the lower bound', () => {
    const found = outliers([row(12, 4_799_999n)], DEFAULT_COMP_RATIO_THRESHOLD);
    expect(ids(found.compRatioOutOfRange)).toEqual([12]);
  });

  it('honours a threshold the caller widens, so the policy lives in the report', () => {
    const found = outliers([row(13, 4_000_000n)], { min: 0.5, max: 1.5 });
    expect(found.compRatioOutOfRange).toEqual([]);
    expect(ids(found.belowBand)).toEqual([13]);
  });

  it('throws when the threshold is inverted', () => {
    expect(() => outliers([row(14, 6_000_000n)], { min: 1.2, max: 0.8 })).toThrow(RangeError);
  });
});
