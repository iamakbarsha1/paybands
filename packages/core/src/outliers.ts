/**
 * People whose pay falls outside what their band sanctions. Decision 40 in
 * `docs/decisions/decision-log.md` carries the signature and the fourth bucket.
 *
 * Rows arrive already joined to their band and already filtered to whoever the
 * report can see. Both are the caller's job: the band join is effective-dated,
 * and decision 29 defines the planted counts over active employees, which is a
 * fact about employment that a pure function has no way to know.
 */

import { compRatio, type PayBand } from './band';
import { compareMoney, type Money } from './money';

export type BandedSalary = {
  readonly employeeId: number;
  readonly salary: Money;
  /** Undefined when no band covers this employee's level and country. */
  readonly band: PayBand | undefined;
};

/** Policy, not a fact about the band, so the report shows it (`docs/glossary.md`). */
export type CompRatioThreshold = {
  readonly min: number;
  readonly max: number;
};

export const DEFAULT_COMP_RATIO_THRESHOLD: CompRatioThreshold = { min: 0.8, max: 1.2 };

export type Outlier = {
  readonly employeeId: number;
  readonly salary: Money;
  /** Null only in `noBand`, where there is no midpoint to divide by. */
  readonly compRatio: number | null;
};

/** Four lists, not one count: an employee can meet more than one condition. */
export type Outliers = {
  readonly belowBand: Outlier[];
  readonly aboveBand: Outlier[];
  readonly compRatioOutOfRange: Outlier[];
  readonly noBand: Outlier[];
};

export function outliers(rows: readonly BandedSalary[], threshold: CompRatioThreshold): Outliers {
  if (!(threshold.min <= threshold.max)) {
    throw new RangeError(
      `Comp ratio threshold must run low to high, got ${threshold.min} to ${threshold.max}`,
    );
  }

  const found: Outliers = {
    belowBand: [],
    aboveBand: [],
    compRatioOutOfRange: [],
    noBand: [],
  };

  for (const { employeeId, salary, band } of rows) {
    const ratio = compRatio(salary, band);
    const entry: Outlier = { employeeId, salary, compRatio: ratio };

    if (band === undefined) {
      found.noBand.push(entry);
      continue;
    }
    if (compareMoney(salary, band.min) < 0) {
      found.belowBand.push(entry);
    }
    if (compareMoney(salary, band.max) > 0) {
      found.aboveBand.push(entry);
    }
    if (ratio !== null && (ratio < threshold.min || ratio > threshold.max)) {
      found.compRatioOutOfRange.push(entry);
    }
  }

  return found;
}
