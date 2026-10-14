/**
 * The band measures are computed by three functions that never call each other.
 * Each one has its own tests; none of them says the three agree. That is the
 * shape of every defect adversarial review found in phase 3 (`tasks/lessons.md`),
 * so these assert the relationships rather than more values.
 */

import { describe, expect, it } from 'vitest';
import {
  compRatio,
  DEFAULT_COMP_RATIO_THRESHOLD,
  money,
  outliers,
  rangePenetration,
  type BandedSalary,
  type PayBand,
} from './index';

/** The seed's shape: symmetric, min and max at 80% and 120% of the midpoint. */
const BAND: PayBand = {
  min: money(4_800_000n, 'GBP'),
  mid: money(6_000_000n, 'GBP'),
  max: money(7_200_000n, 'GBP'),
};

/** A sweep from well under the floor to well over the ceiling, in £1,000 steps. */
const SWEEP: BandedSalary[] = Array.from({ length: 61 }, (_unused, step) => ({
  employeeId: step,
  salary: money(3_000_000n + BigInt(step) * 100_000n, 'GBP'),
  band: BAND,
}));

const found = outliers(SWEEP, DEFAULT_COMP_RATIO_THRESHOLD);
const below = new Set(found.belowBand.map((entry) => entry.employeeId));
const above = new Set(found.aboveBand.map((entry) => entry.employeeId));

describe('the band measures agree with each other', () => {
  it('reports exactly the salaries at a negative range penetration as below band', () => {
    const negative = SWEEP.filter((row) => (rangePenetration(row.salary, row.band) ?? 0) < 0);
    expect(negative.map((row) => row.employeeId)).toEqual([...below]);
    expect(below.size).toBeGreaterThan(0);
  });

  it('reports exactly the salaries past a range penetration of 1 as above band', () => {
    const over = SWEEP.filter((row) => (rangePenetration(row.salary, row.band) ?? 0) > 1);
    expect(over.map((row) => row.employeeId)).toEqual([...above]);
    expect(above.size).toBeGreaterThan(0);
  });

  it('never calls one salary both below and above its band', () => {
    expect([...below].filter((id) => above.has(id))).toEqual([]);
  });

  it('reaches a comp ratio of 1 at the same salary range penetration reaches 0.5', () => {
    // True only because this band is symmetric, which the seed's are. An
    // asymmetric band separates the two, which is why both are reported.
    const atMidpoint = SWEEP.filter((row) => compRatio(row.salary, row.band) === 1);
    const atHalf = SWEEP.filter((row) => rangePenetration(row.salary, row.band) === 0.5);
    expect(atMidpoint.map((row) => row.employeeId)).toEqual(atHalf.map((row) => row.employeeId));
    expect(atMidpoint).toHaveLength(1);
  });

  it('moves comp ratio and range penetration in the same direction across the sweep', () => {
    for (let index = 1; index < SWEEP.length; index += 1) {
      const previous = SWEEP[index - 1];
      const current = SWEEP[index];
      if (previous === undefined || current === undefined) {
        continue;
      }
      expect(compRatio(current.salary, current.band)).toBeGreaterThan(
        compRatio(previous.salary, previous.band) ?? 0,
      );
      expect(rangePenetration(current.salary, current.band)).toBeGreaterThan(
        rangePenetration(previous.salary, previous.band) ?? 0,
      );
    }
  });

  it('agrees that an unbanded salary has no measure at all', () => {
    const salary = money(6_000_000n, 'GBP');
    expect(compRatio(salary, undefined)).toBeNull();
    expect(rangePenetration(salary, undefined)).toBeNull();
    const unbanded = outliers([{ employeeId: 1, salary, band: undefined }], {
      min: 0.8,
      max: 1.2,
    });
    expect(unbanded.noBand).toHaveLength(1);
    expect(unbanded.belowBand.concat(unbanded.aboveBand, unbanded.compRatioOutOfRange)).toEqual([]);
  });
});
