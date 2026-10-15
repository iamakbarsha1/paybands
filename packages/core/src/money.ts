/**
 * Money is an integer count of minor units plus a currency. `bigint` is the
 * whole reason there is no float anywhere in the comp arithmetic: it cannot
 * silently round the way a `number` does past 2^53.
 */

import { isCurrencyCode, minorUnitsFor, type CurrencyCode } from './domain';

export type Money = {
  readonly amount: bigint;
  readonly currency: CurrencyCode;
};

/** Takes a `string` so the check happens here, where values arrive from the database and the API. */
export function money(amount: bigint, currency: string): Money {
  if (!isCurrencyCode(currency)) {
    throw new RangeError(`Unknown currency code: ${currency}`);
  }
  return { amount, currency };
}

/** Digits, optionally a point and more digits. No sign, no separators, nothing else. */
const PLAIN_AMOUNT = /^(\d+)(?:\.(\d+))?$/u;

/**
 * The amount a person types, in major units, read into the minor units everything else
 * holds. The digits are moved by string, never by multiplication: `96000.57 * 100` is
 * 9600056.999999999 in a double, and this is the one place a typed salary could pick up
 * that error.
 *
 * Returns `null` for anything that is not a plain amount in this currency — a sign, a
 * thousands separator, text, or more decimal places than the currency has. Zero parses;
 * whether a zero salary is allowed belongs to whoever asked for the number.
 */
export function moneyFromMajorUnits(input: string, currency: string): Money | null {
  if (!isCurrencyCode(currency)) return null;

  const match = PLAIN_AMOUNT.exec(input.trim());
  if (match === null) return null;

  const [, whole = '', fraction = ''] = match;
  const places = minorUnitsFor(currency);
  // A currency with no minor unit has no decimal part to take, and JPY is why.
  if (fraction.length > places) return null;

  return { amount: BigInt(whole + fraction.padEnd(places, '0')), currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Cannot combine ${a.currency} with ${b.currency} without an FX rate`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

/**
 * Integer division rounded to nearest, ties away from zero. One copy of the rule,
 * so the conversion and the percentile cannot round apart (decisions 36, 39).
 */
export function divideHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  const sign = numerator < 0n ? -1n : 1n;
  return (sign * (sign * numerator * 2n + denominator)) / (denominator * 2n);
}

/** Negative, zero or positive, so it works as a comparator passed straight to `sort`. */
export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}
