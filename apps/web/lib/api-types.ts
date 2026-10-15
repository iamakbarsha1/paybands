import type { CurrencyCode, Gender, SalaryReason } from '@paybands/core';

/**
 * The shapes the API answers with, named here once so no screen invents its own. Every
 * domain word in them — a currency, a gender, a reason for a raise — comes from
 * `@paybands/core`, which is the same module the API validates against.
 *
 * Money crosses the wire as a string because minor units are `bigint` and JSON has no
 * bigint. It is parsed where it is formatted, never earlier.
 */
export interface MoneyWire {
  readonly amountMinor: string;
  readonly currencyCode: CurrencyCode;
}

export interface EmployeeListItem {
  readonly id: number;
  readonly employeeCode: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly gender: Gender;
  readonly countryCode: string;
  readonly departmentId: number;
  readonly jobLevelId: number;
  readonly hireDate: string;
  readonly terminationDate: string | null;
  readonly status: 'active' | 'left';
}

export interface EmployeePage {
  readonly employees: readonly EmployeeListItem[];
  readonly nextCursor: string | null;
}

export interface SalaryRecordWire extends MoneyWire {
  readonly id: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly reason: SalaryReason;
}

export interface EmployeeDetail {
  readonly employee: EmployeeListItem & {
    readonly managerId: number | null;
    readonly departmentName: string;
    readonly jobLevelName: string;
  };
  readonly salaryHistory: readonly SalaryRecordWire[];
  readonly currentSalary: MoneyWire | null;
  readonly band: {
    readonly min: MoneyWire;
    readonly mid: MoneyWire;
    readonly max: MoneyWire;
  } | null;
  readonly compRatio: number | null;
  readonly rangePenetration: number | null;
}

/**
 * One row of `/analytics/bands`: a band and how many active people sit in it. The three
 * figures arrive as bare minor-unit strings rather than `MoneyWire`, because the band row
 * carries one currency for all three.
 */
export interface BandRow {
  readonly jobLevelId: number;
  readonly jobLevelName: string;
  readonly countryCode: string;
  readonly currencyCode: CurrencyCode;
  readonly minMinor: string;
  readonly midMinor: string;
  readonly maxMinor: string;
  readonly headcount: number;
}

export interface BandsReport {
  readonly bands: readonly BandRow[];
}

/** The four points `docs/glossary.md` names, in USD minor units. Null means no salaries. */
export interface Percentiles {
  readonly p25: string;
  readonly p50: string;
  readonly p75: string;
  readonly p90: string;
}

export interface DistributionGroup {
  readonly key: string;
  readonly name: string;
  readonly headcount: number;
  readonly percentiles: Percentiles | null;
}

export interface Distribution {
  readonly groupBy: 'country' | 'department' | 'level';
  readonly currency: 'USD';
  readonly groups: readonly DistributionGroup[];
}

/** A half-open comp-ratio bucket. A null end is the open one: below the first, above the last. */
export interface CompRatioBucket {
  readonly from: number | null;
  readonly to: number | null;
}

export interface CompRatioSummary {
  readonly headcount: number;
  /** The people with a band — the only ones a comp ratio exists for. */
  readonly measured: number;
  readonly unbanded: number;
  /** One count per bucket, in the order the response lists them. */
  readonly counts: readonly number[];
}

export interface CompRatioReport {
  readonly groupBy: 'country' | 'department' | 'level';
  readonly buckets: readonly CompRatioBucket[];
  readonly overall: CompRatioSummary;
  readonly groups: readonly (CompRatioSummary & { readonly key: string; readonly name: string })[];
}

export interface OutlierRow {
  readonly employeeId: number;
  readonly employeeCode: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly countryCode: string;
  readonly departmentName: string;
  readonly jobLevelName: string;
  readonly salary: MoneyWire;
  readonly compRatio: number | null;
}

/** Four lists, not one with a label: the fourth is a gap in the band table, not a person's pay. */
export interface OutliersReport {
  readonly threshold: { readonly min: number; readonly max: number };
  readonly belowBand: readonly OutlierRow[];
  readonly aboveBand: readonly OutlierRow[];
  readonly compRatioOutOfRange: readonly OutlierRow[];
  readonly noBand: readonly OutlierRow[];
}

/**
 * A gap, or a stated refusal to publish one. `suppressed` carries `reason` and leaves both
 * figures null — never a zero, which would read as "no gap" (`docs/glossary.md`).
 */
export interface PayGap {
  readonly headcount: number;
  readonly compared: { readonly male: number; readonly female: number };
  readonly excluded: number;
  readonly suppressed: boolean;
  readonly reason: string | null;
  readonly meanGap: number | null;
  readonly medianGap: number | null;
}

export interface PayGapReport {
  readonly groupBy: 'country' | 'department' | 'level';
  readonly currency: 'USD';
  readonly minGroupSize: number;
  readonly overall: PayGap;
  readonly groups: readonly (PayGap & { readonly key: string; readonly name: string })[];
}

export interface ReferenceData {
  readonly currencies: readonly CurrencyCode[];
  readonly genders: readonly Gender[];
  readonly salaryReasons: readonly SalaryReason[];
  readonly countries: readonly { readonly code: string; readonly name: string }[];
  readonly departments: readonly { readonly id: number; readonly name: string }[];
  readonly jobLevels: readonly { readonly id: number; readonly name: string }[];
}

export interface SessionUser {
  readonly user: { readonly id: number; readonly email: string; readonly displayName: string };
}
