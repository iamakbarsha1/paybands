/**
 * The vocabulary the database, the API and the UI all have to agree on.
 * See `docs/data-model.md` and `docs/glossary.md`.
 */

/** No `null`: `undisclosed` is a recorded answer, so the gap report can count it in headcount and still exclude it from the comparison. */
export const GENDERS = ['female', 'male', 'other', 'undisclosed'] as const;
export type Gender = (typeof GENDERS)[number];

/** Why a salary record exists. Carried on the record, not inferred from dates. */
export const SALARY_REASONS = ['hire', 'merit', 'promotion', 'market'] as const;
export type SalaryReason = (typeof SALARY_REASONS)[number];

/** The groupings every sliced report offers. One closed set, so two reports cannot disagree. */
export const SLICE_GROUPS = ['country', 'department', 'level'] as const;
export type SliceGroup = (typeof SLICE_GROUPS)[number];

/** Decimal places per ISO 4217. The reason JPY must never be assumed to have two. */
export const CURRENCY_MINOR_UNITS = {
  USD: 2,
  GBP: 2,
  EUR: 2,
  INR: 2,
  SGD: 2,
  JPY: 0,
} as const satisfies Record<string, number>;

export type CurrencyCode = keyof typeof CURRENCY_MINOR_UNITS;

export const CURRENCY_CODES = Object.keys(CURRENCY_MINOR_UNITS) as CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(CURRENCY_MINOR_UNITS, value);
}

/** Throws rather than defaulting to 2 — formatting ¥1234 as ¥12.34 is a wrong number nobody notices. */
export function minorUnitsFor(code: string): number {
  if (!isCurrencyCode(code)) {
    throw new RangeError(`Unknown currency code: ${code}`);
  }
  return CURRENCY_MINOR_UNITS[code];
}
