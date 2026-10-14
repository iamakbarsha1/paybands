/**
 * Effective-dated conversion to USD. Decisions 33 to 36 in
 * `docs/decisions/decision-log.md` carry the reasoning for all four rules this
 * file encodes: the scale factor, the refusal, the window convention and the
 * rounding point.
 */

import { minorUnitsFor, type CurrencyCode } from './domain';
import { divideHalfAwayFromZero, money, type Money } from './money';

export type FxRate = {
  readonly currency: CurrencyCode;
  /** One *major* unit of this currency in USD millionths: GBP 1_380_000 is $1.38 per pound. */
  readonly rateToUsdMicros: number;
  readonly effectiveFrom: Date;
  /** Exclusive. Null is open-ended. The boundary date belongs to the later period. */
  readonly effectiveTo: Date | null;
};

const MICROS = 1_000_000n;
const USD_MINOR_UNITS = minorUnitsFor('USD');

/** Throws when no rate covers the date: a conversion without a rate has no answer worth inventing. */
export function toUsd(amount: Money, rates: readonly FxRate[], onDate: Date): Money {
  const rate = findRate(amount.currency, rates, onDate);
  if (rate === undefined) {
    const day = onDate.toISOString().slice(0, 10);
    throw new RangeError(`No FX rate for ${amount.currency} on ${day}`);
  }

  // The rate is quoted major-to-major, so a currency whose minor unit is not USD's
  // needs the difference applied. Without it JPY lands 100x low.
  const scaleGap = USD_MINOR_UNITS - minorUnitsFor(amount.currency);
  const numerator = amount.amount * BigInt(rate.rateToUsdMicros) * pow10(Math.max(scaleGap, 0));
  const denominator = MICROS * pow10(Math.max(-scaleGap, 0));

  return money(divideHalfAwayFromZero(numerator, denominator), 'USD');
}

function findRate(
  currency: CurrencyCode,
  rates: readonly FxRate[],
  onDate: Date,
): FxRate | undefined {
  const at = onDate.getTime();
  return rates.find(
    (rate) =>
      rate.currency === currency &&
      rate.effectiveFrom.getTime() <= at &&
      (rate.effectiveTo === null || at < rate.effectiveTo.getTime()),
  );
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}
