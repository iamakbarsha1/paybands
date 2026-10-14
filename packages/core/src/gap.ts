/**
 * The unadjusted gender pay gap over one slice. Decision 41 in
 * `docs/decisions/decision-log.md` carries the signature and the suppression
 * key; `docs/glossary.md` carries the two formulas and what the gap is not.
 *
 * Salaries must already share a currency. A gap across countries is computed on
 * normalised USD, which is the caller's conversion to make.
 */

import type { Gender } from './domain';
import { addMoney, type Money } from './money';
import { percentiles } from './stats';

export type GenderedSalary = {
  readonly gender: Gender;
  readonly salary: Money;
};

export type PayGapOptions = {
  /** Policy. Either compared group below this and the figure is withheld. */
  readonly minGroupSize: number;
};

export type PayGap = {
  /** Everyone in the slice, including those excluded from the comparison. */
  readonly headcount: number;
  readonly compared: { readonly male: number; readonly female: number };
  /** `other` and `undisclosed`: counted here rather than dropped silently. */
  readonly excluded: number;
  readonly suppressed: boolean;
  /** Why the figure is withheld. Null when it is not. */
  readonly reason: string | null;
  readonly meanGap: number | null;
  readonly medianGap: number | null;
};

/** Male is the reference group, so a positive gap means women are paid less. */
export function payGap(people: readonly GenderedSalary[], { minGroupSize }: PayGapOptions): PayGap {
  if (!Number.isInteger(minGroupSize) || minGroupSize < 1) {
    throw new RangeError(
      `Minimum group size must be a whole number of at least 1, got ${minGroupSize}`,
    );
  }

  // Checked across the whole slice, not just the compared groups: a stray currency
  // among the excluded still means this slice needed normalising first.
  assertOneCurrency(people.map((person) => person.salary));

  const male = salariesOf(people, 'male');
  const female = salariesOf(people, 'female');
  const counted = {
    headcount: people.length,
    compared: { male: male.length, female: female.length },
    excluded: people.length - male.length - female.length,
  };

  if (male.length < minGroupSize || female.length < minGroupSize) {
    return {
      ...counted,
      suppressed: true,
      reason: `a compared group is below the minimum of ${minGroupSize}`,
      meanGap: null,
      medianGap: null,
    };
  }

  return {
    ...counted,
    suppressed: false,
    reason: null,
    meanGap: gapBetween(meanTimes(male, female), meanTimes(female, male)),
    medianGap: gapBetween(medianOf(male), medianOf(female)),
  };
}

function salariesOf(people: readonly GenderedSalary[], gender: Gender): Money[] {
  return people.filter((person) => person.gender === gender).map((person) => person.salary);
}

/** `addMoney` refuses a mismatch, so summing the slice is the currency check. */
function assertOneCurrency(salaries: readonly Money[]): void {
  if (salaries.length > 0) {
    salaries.reduce(addMoney);
  }
}

/**
 * The group's total scaled by the *other* group's size. Comparing two of these
 * is the same comparison as between the two means, with the division deferred
 * so only the final gap is a double.
 */
function meanTimes(group: readonly Money[], other: readonly Money[]): bigint {
  const total = group.reduce((sum, salary) => sum + salary.amount, 0n);
  return total * BigInt(other.length);
}

function medianOf(salaries: readonly Money[]): bigint {
  const median = percentiles(salaries, [50])?.[0];
  if (median === undefined) {
    throw new RangeError('A median needs at least one salary');
  }
  return median.value.amount;
}

/** `(reference − compared) ÷ reference`, as a share of the reference group. */
function gapBetween(reference: bigint, compared: bigint): number {
  if (reference <= 0n) {
    throw new RangeError('The reference group has no pay to compare against');
  }
  return 1 - Number(compared) / Number(reference);
}
