/**
 * Where a salary sits against its band. Decisions 11, 37 and 38 in
 * `docs/decisions/decision-log.md` carry the three rules this file encodes:
 * local currency only, a plain number from a single division, and a null for
 * the employee the glossary says must still appear in the report.
 */

import type { Money } from './money';

/** One currency per row in the schema, so the three figures cannot disagree. */
export type PayBand = {
  readonly min: Money;
  readonly mid: Money;
  readonly max: Money;
};

/** Converting instead would make the measure move when a rate moves (decision 11). */
function assertComparable(salary: Money, figure: Money): void {
  if (salary.currency !== figure.currency) {
    throw new TypeError(
      `Cannot compare a ${salary.currency} salary against a ${figure.currency} band`,
    );
  }
}

/**
 * Salary over midpoint, unitless. Null means no band — rendered as "no band",
 * never as zero and never by dropping the employee (`docs/glossary.md`).
 */
export function compRatio(salary: Money, band: PayBand | undefined): number | null {
  if (band === undefined) {
    return null;
  }
  const { mid } = band;
  assertComparable(salary, mid);
  if (mid.amount <= 0n) {
    throw new RangeError(`Band midpoint must be positive, got ${mid.amount}`);
  }
  return Number(salary.amount) / Number(mid.amount);
}

/**
 * Position in the band, 0 at the minimum and 1 at the maximum. Values outside
 * that range are real and are not clamped: below 0 is under the band floor and
 * above 1 is over its ceiling, both outlier conditions (`docs/glossary.md`).
 * Both subtractions happen in `bigint`, so only the final ratio is a double.
 */
export function rangePenetration(salary: Money, band: PayBand | undefined): number | null {
  if (band === undefined) {
    return null;
  }
  assertComparable(salary, band.min);
  assertComparable(salary, band.max);
  const width = band.max.amount - band.min.amount;
  if (width <= 0n) {
    throw new RangeError(`Band width must be positive, got ${width}`);
  }
  return Number(salary.amount - band.min.amount) / Number(width);
}
