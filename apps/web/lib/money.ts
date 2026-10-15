import { minorUnitsFor } from '@paybands/core';
import type { MoneyWire } from './api-types';

/**
 * Minor units come over the wire as a string because they are `bigint`. They are parsed
 * here, at the last moment before they are read by a person, and nowhere else: no screen
 * does arithmetic on them, which is what keeps the maths in `@paybands/core`.
 */
export function formatMoney(money: MoneyWire): string {
  const scale = 10 ** minorUnitsFor(money.currencyCode);

  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: money.currencyCode,
    maximumFractionDigits: 0,
  }).format(Number(money.amountMinor) / scale);
}

/** A ratio as the percentage people talk in. Null stays null — it means "no band". */
export function formatRatio(ratio: number | null): string {
  return ratio === null ? '—' : `${(ratio * 100).toFixed(1)}%`;
}
