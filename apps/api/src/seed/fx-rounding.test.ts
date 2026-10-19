/**
 * Decision 36's falsifier, fired: *"A report that sums converted USD across all 10,000
 * employees and is reconciled against an external figure."*
 *
 * The external figure is computed here by a different method. `toUsd` divides once per row
 * and rounds there; the reference never divides per row at all — it accumulates every row's
 * undivided numerator and divides once at the end, so the only rounding in it is the last
 * cent of the total. That is the figure an auditor with a spreadsheet of exact rationals
 * would arrive at, and it is what the two per-row modes are measured against.
 *
 * The entry's **U** line said the truncation bias is "about $50 … roughly one part in ten
 * million, which moves no percentile, no comp ratio and no gap percentage", and conceded
 * that this was the thin part. These assertions are that sentence turned into arithmetic
 * against the shipped seed. The numbers they produce are recorded in the entry.
 *
 * No database: the seed generator is deterministic (decision 24) and is the same code the
 * writer runs, so the rows here are the rows in the database.
 */

import { describe, expect, it } from 'vitest';
import { minorUnitsFor, money, toUsd, type FxRate, type Money } from '@paybands/core';
import { generate, SEED } from './generate';
import { TODAY } from './reference';

const MICROS = 1_000_000n;
const USD_MINOR_UNITS = minorUnitsFor('USD');

const seed = generate(SEED);

const RATES: FxRate[] = seed.fxRates.map((rate) => ({
  currency: rate.currencyCode,
  rateToUsdMicros: rate.rateToUsdMicros,
  effectiveFrom: rate.effectiveFrom,
  effectiveTo: rate.effectiveTo,
}));

/** The rate covering `TODAY`, which is the date every report converts at. */
function rateFor(currency: FxRate['currency']): bigint {
  const at = TODAY.getTime();
  const rate = RATES.find(
    (candidate) =>
      candidate.currency === currency &&
      candidate.effectiveFrom.getTime() <= at &&
      (candidate.effectiveTo === null || at < candidate.effectiveTo.getTime()),
  );
  if (rate === undefined) throw new Error(`no rate for ${currency} on ${TODAY.toISOString()}`);
  return BigInt(rate.rateToUsdMicros);
}

/** What every report sums: one open salary record per active employee. */
const OPEN_SALARIES: Money[] = (() => {
  const active = new Set(
    seed.employees.filter((employee) => employee.terminationDate === null).map(({ id }) => id),
  );
  return seed.salaryRecords
    .filter((record) => record.effectiveTo === null && active.has(record.employeeId))
    .map((record) => money(record.amountMinor, record.currencyCode));
})();

/**
 * `toUsd`'s numerator and denominator for one amount, which the three modes then divide
 * differently. Kept here rather than imported so the reference is arrived at independently
 * of the function under measurement.
 */
function fraction(amount: Money): { numerator: bigint; denominator: bigint } {
  const scaleGap = USD_MINOR_UNITS - minorUnitsFor(amount.currency);
  return {
    numerator: amount.amount * rateFor(amount.currency) * 10n ** BigInt(Math.max(scaleGap, 0)),
    denominator: MICROS * 10n ** BigInt(Math.max(-scaleGap, 0)),
  };
}

/** Half away from zero, written out rather than imported, for the same reason. */
function roundHalfAway(numerator: bigint, denominator: bigint): bigint {
  const sign = numerator < 0n ? -1n : 1n;
  return (sign * (sign * numerator * 2n + denominator)) / (denominator * 2n);
}

interface Totals {
  /** What ships: `toUsd` per row, rounded there, then added up. */
  shipped: bigint;
  /** Decision 36's "Cheaper": BigInt `/` per row, truncating toward zero, then added up. */
  truncated: bigint;
  /** The reconciliation figure: no per-row division at all, one division at the end. */
  exact: bigint;
  rows: number;
  /**
   * Rows whose division leaves a remainder, which are the only ones a rounding mode can
   * disagree about. A USD row is quoted at 1,000,000 micros and divides exactly, so the
   * modes are identical on every one of them — which is why the bias per row across the
   * whole payroll is well under the half a unit a remainder-bearing row averages.
   */
  inexact: number;
}

const totals: Totals = (() => {
  let shipped = 0n;
  let truncated = 0n;
  let numerators = 0n;
  let inexact = 0;
  let denominator: bigint | null = null;

  for (const salary of OPEN_SALARIES) {
    const part = fraction(salary);

    // Every currency in this seed has at most as many minor units as USD, so the denominator
    // is 1,000,000 for all of them and the numerators can be added before dividing. A
    // currency with three minor units would break that, and should break this test rather
    // than quietly reconcile against the wrong reference.
    denominator ??= part.denominator;
    expect(part.denominator).toBe(denominator);

    numerators += part.numerator;
    shipped += toUsd(salary, RATES, TODAY).amount;
    truncated += part.numerator / part.denominator;
    if (part.numerator % part.denominator !== 0n) inexact += 1;
  }

  return {
    shipped,
    truncated,
    exact: roundHalfAway(numerators, denominator ?? MICROS),
    rows: OPEN_SALARIES.length,
    inexact,
  };
})();

/** Cents to a readable dollar figure, for the messages a failure prints. */
const dollars = (minor: bigint): string => `$${(Number(minor) / 100).toLocaleString('en-US')}`;

describe('converted USD, reconciled against a figure that never rounds per row', () => {
  it('has something to measure: the whole active payroll, converted', () => {
    expect(totals.rows).toBeGreaterThan(9_000);
    // Hundreds of millions, which is the denominator every "immaterial" claim below is
    // immaterial against.
    expect(totals.exact).toBeGreaterThan(100_000_000_00n);
  });

  it('rounds to the nearest cent, so the shipped total lands within a cent per thousand rows', () => {
    const drift = totals.shipped - totals.exact;
    const magnitude = drift < 0n ? -drift : drift;

    // Half away from zero has no direction to drift in: the per-row errors are as often up
    // as down and cancel, leaving a residual that grows with the square root of the row
    // count rather than with the row count.
    expect(magnitude).toBeLessThan(BigInt(totals.rows) / 1_000n + 100n);
  });

  it('truncating loses half a cent on every row that has a remainder, always downward', () => {
    const loss = totals.exact - totals.truncated;

    // Never in the employee's favour: `/` on a positive numerator always rounds down.
    expect(loss).toBeGreaterThan(0n);
    // Half a minor unit averaged over the rows that round at all — not over every row. A USD
    // row divides exactly and the two modes agree on it, which is most of the difference
    // between this figure and the one a back-of-envelope "half a cent each" would predict.
    expect(loss).toBeGreaterThan((BigInt(totals.inexact) * 45n) / 100n);
    expect(loss).toBeLessThan((BigInt(totals.inexact) * 55n) / 100n);
    expect(totals.inexact).toBeLessThan(totals.rows);
  });

  it('and loses it immaterially: under one part in a million of the payroll', () => {
    const loss = totals.exact - totals.truncated;

    expect(loss * 1_000_000n).toBeLessThan(totals.exact);
  });

  it('prints the three figures, because the decision quotes them', () => {
    const report = [
      `rows: ${totals.rows}, of which ${totals.inexact} leave a remainder`,
      `exact (one division at the end): ${dollars(totals.exact)}`,
      `shipped (half away from zero per row): ${dollars(totals.shipped)}, ` +
        `${totals.shipped - totals.exact} minor units from exact`,
      `truncated (BigInt / per row): ${dollars(totals.truncated)}, ` +
        `${totals.truncated - totals.exact} minor units from exact`,
    ].join('\n  ');

    console.info(`\n  ${report}\n`);
    expect(report).toContain('rows:');
  });
});
