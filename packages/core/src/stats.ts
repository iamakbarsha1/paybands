/**
 * Group statistics over salaries. Decision 39 in
 * `docs/decisions/decision-log.md` carries the return shape and the rounding
 * point; the interpolation method itself is fixed by `docs/glossary.md`.
 */

import { compareMoney, divideHalfAwayFromZero, money, type Money } from './money';

export type Percentile = {
  /** The point asked for, 0 to 100. */
  readonly p: number;
  readonly value: Money;
};

/**
 * Linear interpolation between closest ranks — NumPy's default and Postgres
 * `PERCENTILE_CONT`, so the SQL and TypeScript paths return the same figure.
 * The rank is `(n − 1) × p / 100`; a rank landing between two salaries takes
 * that fraction of the gap, rounded to a whole minor unit.
 *
 * Null means the group was empty, which the distribution report renders rather
 * than treating as zero. Results come back in the order the points were asked.
 */
export function percentiles(
  values: readonly Money[],
  points: readonly number[],
): Percentile[] | null {
  const first = values[0];
  if (first === undefined) {
    return null;
  }
  for (const point of points) {
    if (!Number.isInteger(point) || point < 0 || point > 100) {
      throw new RangeError(`Percentile point must be a whole number from 0 to 100, got ${point}`);
    }
  }

  // A copy, because sorting the caller's array is a side effect they did not ask
  // for. compareMoney refuses a mixed-currency group on the way past.
  const sorted = [...values].sort(compareMoney);
  const lastRank = BigInt(sorted.length - 1);

  return points.map((point) => {
    const scaledRank = lastRank * BigInt(point);
    const lower = Number(scaledRank / 100n);
    const fraction = scaledRank % 100n;
    const base = amountAt(sorted, lower);
    const amount =
      fraction === 0n
        ? base
        : base + divideHalfAwayFromZero((amountAt(sorted, lower + 1) - base) * fraction, 100n);
    return { p: point, value: money(amount, first.currency) };
  });
}

/** The rank arithmetic keeps both reads in range; this says so out loud rather than asserting. */
function amountAt(sorted: readonly Money[], index: number): bigint {
  const found = sorted[index];
  if (found === undefined) {
    throw new RangeError(`Rank ${index} falls outside a group of ${sorted.length}`);
  }
  return found.amount;
}
