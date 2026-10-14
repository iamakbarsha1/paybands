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

/**
 * Salary over midpoint, unitless. Null means no band — rendered as "no band",
 * never as zero and never by dropping the employee (`docs/glossary.md`).
 */
export function compRatio(salary: Money, band: PayBand | undefined): number | null {
  if (band === undefined) {
    return null;
  }
  const { mid } = band;
  if (salary.currency !== mid.currency) {
    // Converting here would make the ratio move when a rate moves (decision 11).
    throw new TypeError(
      `Cannot compare a ${salary.currency} salary against a ${mid.currency} band`,
    );
  }
  if (mid.amount <= 0n) {
    throw new RangeError(`Band midpoint must be positive, got ${mid.amount}`);
  }
  return Number(salary.amount) / Number(mid.amount);
}
