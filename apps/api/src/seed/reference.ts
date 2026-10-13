import { CURRENCY_MINOR_UNITS, type CurrencyCode, type Gender } from '@paybands/core';

export type CountryCode = 'US' | 'GB' | 'DE' | 'IN' | 'SG' | 'JP';

export interface CurrencyRow {
  code: CurrencyCode;
  name: string;
  symbol: string;
  minorUnit: number;
}

export interface CountryRow {
  code: CountryCode;
  name: string;
  currencyCode: CurrencyCode;
}

export interface FxRateRow {
  id: number;
  currencyCode: CurrencyCode;
  rateToUsdMicros: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface DepartmentRow {
  id: number;
  name: string;
}

export interface JobLevelRow {
  id: number;
  name: string;
  rank: number;
}

export interface PayBandRow {
  id: number;
  jobLevelId: number;
  countryCode: CountryCode;
  minMinor: bigint;
  midMinor: bigint;
  maxMinor: bigint;
  currencyCode: CurrencyCode;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** The "now" every generated date is measured against. A clock read would break the hash in `generate.test.ts`. */
export const TODAY = new Date(Date.UTC(2026, 9, 1));

const FX_PERIOD_TWO_FROM = new Date(Date.UTC(2024, 0, 1));

export const EMPLOYEE_COUNT = 10_000;

export const HIRE_FROM = new Date(Date.UTC(2014, 0, 1));
export const HIRE_TO = new Date(Date.UTC(2026, 7, 1));

export const TERMINATION_RATE = 0.08;
export const TERMINATION_EARLIEST_DAYS = 180;

export const CURRENCIES: CurrencyRow[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', minorUnit: CURRENCY_MINOR_UNITS.USD },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', minorUnit: CURRENCY_MINOR_UNITS.GBP },
  { code: 'EUR', name: 'Euro', symbol: '€', minorUnit: CURRENCY_MINOR_UNITS.EUR },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', minorUnit: CURRENCY_MINOR_UNITS.INR },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', minorUnit: CURRENCY_MINOR_UNITS.SGD },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', minorUnit: CURRENCY_MINOR_UNITS.JPY },
];

export const COUNTRIES: CountryRow[] = [
  { code: 'US', name: 'United States', currencyCode: 'USD' },
  { code: 'GB', name: 'United Kingdom', currencyCode: 'GBP' },
  { code: 'DE', name: 'Germany', currencyCode: 'EUR' },
  { code: 'IN', name: 'India', currencyCode: 'INR' },
  { code: 'SG', name: 'Singapore', currencyCode: 'SGD' },
  { code: 'JP', name: 'Japan', currencyCode: 'JPY' },
];

const RATE_MICROS: Record<CurrencyCode, readonly [number, number]> = {
  USD: [1_000_000, 1_000_000],
  GBP: [1_380_000, 1_270_000],
  EUR: [1_120_000, 1_080_000],
  INR: [15_000, 12_000],
  SGD: [720_000, 740_000],
  JPY: [8_300, 6_700],
};

export const FX_RATES: FxRateRow[] = CURRENCIES.flatMap((currency, index) => {
  const [periodOne, periodTwo] = RATE_MICROS[currency.code];
  return [
    {
      id: index * 2 + 1,
      currencyCode: currency.code,
      rateToUsdMicros: periodOne,
      effectiveFrom: HIRE_FROM,
      effectiveTo: FX_PERIOD_TWO_FROM,
    },
    {
      id: index * 2 + 2,
      currencyCode: currency.code,
      rateToUsdMicros: periodTwo,
      effectiveFrom: FX_PERIOD_TWO_FROM,
      effectiveTo: null,
    },
  ];
});

export const DEPARTMENTS: DepartmentRow[] = [
  { id: 1, name: 'Engineering' },
  { id: 2, name: 'Sales' },
  { id: 3, name: 'Customer Success' },
  { id: 4, name: 'Product' },
  { id: 5, name: 'Marketing' },
  { id: 6, name: 'Operations' },
  { id: 7, name: 'Design' },
  { id: 8, name: 'Finance' },
  { id: 9, name: 'People' },
  { id: 10, name: 'Legal' },
];

export const SALES_DEPARTMENT_ID = 2;

/** Legal is sized under any reportable threshold, so the gap report has a group it must suppress. */
export const LEGAL = { departmentId: 10, male: 8, female: 3 } as const;

export const DEPARTMENT_WEIGHTS: readonly (readonly [number, number])[] = [
  [1, 30],
  [2, 15],
  [3, 10],
  [4, 8],
  [5, 8],
  [6, 8],
  [7, 6],
  [8, 6],
  [9, 5],
];

export const COUNTRY_WEIGHTS: readonly (readonly [CountryCode, number])[] = [
  ['US', 35],
  ['IN', 25],
  ['GB', 12],
  ['DE', 12],
  ['SG', 9],
  ['JP', 7],
];

export const GENDER_WEIGHTS: readonly (readonly [Gender, number])[] = [
  ['female', 44],
  ['male', 52],
  ['other', 2],
  ['undisclosed', 2],
];

/** Percent of headcount per level, L1 first. Sums to 100. */
export const LEVEL_PYRAMID_PERCENT: readonly number[] = [9, 22, 26, 21, 12, 6, 3, 1];

export interface CompRatioTarget {
  center: number;
  spread: number;
}

export const COMP_RATIO_DEFAULT: CompRatioTarget = { center: 1.0, spread: 0.17 };
export const COMP_RATIO_SALES_FEMALE: CompRatioTarget = { center: 0.92, spread: 0.11 };
export const COMP_RATIO_SALES_MALE: CompRatioTarget = { center: 1.04, spread: 0.11 };
// Inside every band's rounded edges and outside both planted outlier ranges, so only the planted
// outliers fall out of band. `generate.test.ts` asserts that over all 48 bands.
export const COMP_RATIO_MIN = 0.82;
export const COMP_RATIO_MAX = 1.18;

export const OUTLIERS_BELOW_BAND = { count: 40, min: 0.62, max: 0.77 } as const;
export const OUTLIERS_ABOVE_BAND = { count: 25, min: 1.24, max: 1.42 } as const;

export const MERIT_GROWTH = { min: 1.03, max: 1.09 } as const;
export const PROMOTION_GROWTH = { min: 1.12, max: 1.2 } as const;

/** USD midpoint per level. The index plus one is both the job level id and its rank. */
const USD_MID_MINOR: readonly bigint[] = [
  5_500_000n,
  7_500_000n,
  10_000_000n,
  13_000_000n,
  17_000_000n,
  21_500_000n,
  27_500_000n,
  36_000_000n,
];

export const JOB_LEVELS: JobLevelRow[] = USD_MID_MINOR.map((_, index) => ({
  id: index + 1,
  name: `L${index + 1}`,
  rank: index + 1,
}));

const MARKET_FACTOR_BPS: Record<CountryCode, bigint> = {
  US: 10_000n,
  GB: 8_500n,
  DE: 8_000n,
  IN: 3_000n,
  SG: 7_500n,
  JP: 7_000n,
};

const ROUNDING_STEP_MINOR: Record<CurrencyCode, bigint> = {
  USD: 100_000n,
  GBP: 100_000n,
  EUR: 100_000n,
  INR: 1_000_000n,
  SGD: 100_000n,
  JPY: 100_000n,
};

function roundToStep(value: bigint, step: bigint): bigint {
  return ((value + step / 2n) / step) * step;
}

export function buildPayBands(): PayBandRow[] {
  const bands: PayBandRow[] = [];
  for (const [index, usdMidMinor] of USD_MID_MINOR.entries()) {
    for (const country of COUNTRIES) {
      const currencyCode = country.currencyCode;
      const step = ROUNDING_STEP_MINOR[currencyCode];
      const localScale = 10n ** BigInt(CURRENCY_MINOR_UNITS[currencyCode]);
      const rateMicros = BigInt(RATE_MICROS[currencyCode][1]);
      // The basis-point scale (10^4) times the USD minor scale (10^2) is exactly the rate's micros
      // (10^6), so the two cancel and no separate scaling step is needed.
      const mid = roundToStep(
        (usdMidMinor * MARKET_FACTOR_BPS[country.code] * localScale) / rateMicros,
        step,
      );
      bands.push({
        id: bands.length + 1,
        jobLevelId: index + 1,
        countryCode: country.code,
        minMinor: roundToStep((mid * 80n) / 100n, step),
        midMinor: mid,
        maxMinor: roundToStep((mid * 120n) / 100n, step),
        currencyCode,
        effectiveFrom: HIRE_FROM,
        effectiveTo: null,
      });
    }
  }
  return bands;
}
