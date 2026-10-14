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

export interface SessionUser {
  readonly user: { readonly id: number; readonly email: string; readonly displayName: string };
}
