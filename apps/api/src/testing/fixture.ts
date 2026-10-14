import type { CurrencyCode, Gender } from '@paybands/core';
import type { AppUserRow, EmployeeRow, SalaryRecordRow } from '../seed/generate';
import {
  buildPayBands,
  COUNTRIES,
  CURRENCIES,
  DEPARTMENTS,
  FX_RATES,
  JOB_LEVELS,
  LEGAL,
  SALES_DEPARTMENT_ID,
  TODAY,
  type CountryCode,
  type PayBandRow,
} from '../seed/reference';
import { addDays } from '../seed/rng';

/**
 * Fifty people, written out rather than generated. The shipped seed is the same domain at
 * 10,000 — too slow to reload between test runs, and its outlier counts are absolute, so
 * shrinking it by parameter would move the RNG stream the seed's own hash test pins
 * (decision 45). The reference tables below are imported from the seed, not retyped, so
 * only the population differs between the two.
 */

const HIRE_BASE = new Date(Date.UTC(2019, 0, 15));

/** Levels 7 and 8 stay empty apart from the unbanded case, so the band table has gaps to report. */
const LEVEL_CYCLE = [1, 2, 3, 4, 5, 6] as const;
const COUNTRY_CYCLE: readonly CountryCode[] = ['US', 'GB', 'DE', 'IN', 'SG', 'JP'];
const DEPARTMENT_CYCLE = [1, 3, 4, 5, 6, 7, 8, 9] as const;
const GENDER_CYCLE: readonly Gender[] = [
  'female',
  'male',
  'male',
  'female',
  'other',
  'undisclosed',
];

const EMPLOYEE_COUNT = 50;
const SALES_IDS = range(11, 22);
const LEGAL_IDS = range(47, 50);

/**
 * The rows a test needs to name. Every one of them is a case some report has to render:
 * a person under their band, over it, with no band at all, gone, or in a group too small
 * to publish.
 */
export const LANDMARKS = {
  belowBandEmployeeId: 7,
  aboveBandEmployeeId: 8,
  unbandedEmployeeId: 50,
  unbandedJobLevelId: 8,
  unbandedCountry: 'JP',
  leaverEmployeeIds: [5, 17, 29, 41] as readonly number[],
  salesDepartmentId: SALES_DEPARTMENT_ID,
  legalDepartmentId: LEGAL.departmentId,
  /** `payGap` suppresses a slice when either compared group is below this. */
  suppressionFloor: 5,
} as const satisfies Record<string, unknown>;

/** The login the API tests authenticate with once phase 7 lands. */
export const FIXTURE_PASSWORD = 'paybands-test-2026';

const CURRENCY_BY_COUNTRY = new Map<CountryCode, CurrencyCode>(
  COUNTRIES.map((country) => [country.code, country.currencyCode]),
);

function range(from: number, to: number): readonly number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function compRatio(id: number, departmentId: number, gender: Gender): number {
  if (id === LANDMARKS.belowBandEmployeeId) return 0.7;
  if (id === LANDMARKS.aboveBandEmployeeId) return 1.3;
  // Sales carries the gap the report has to find, the same direction the seed plants it.
  if (departmentId === SALES_DEPARTMENT_ID) return gender === 'female' ? 0.92 : 1.04;
  return 0.95 + (id % 7) * 0.03;
}

function departmentOf(id: number): number {
  if (SALES_IDS.includes(id)) return SALES_DEPARTMENT_ID;
  if (LEGAL_IDS.includes(id)) return LEGAL.departmentId;
  return DEPARTMENT_CYCLE[id % DEPARTMENT_CYCLE.length] ?? 1;
}

function genderOf(id: number, departmentId: number): Gender {
  // Legal is three men and one woman: both groups land under the floor, so the slice is suppressed.
  if (departmentId === LEGAL.departmentId) return id === LEGAL_IDS[0] ? 'female' : 'male';
  if (departmentId === SALES_DEPARTMENT_ID) return id % 2 === 0 ? 'female' : 'male';
  return GENDER_CYCLE[id % GENDER_CYCLE.length] ?? 'undisclosed';
}

function buildEmployees(): EmployeeRow[] {
  return range(1, EMPLOYEE_COUNT).map((id) => {
    const departmentId = departmentOf(id);
    const unbanded = id === LANDMARKS.unbandedEmployeeId;
    const hireDate = addDays(HIRE_BASE, id * 37);

    return {
      id,
      employeeCode: `T-${String(id).padStart(4, '0')}`,
      firstName: `Test${id}`,
      // Every fifth person shares a surname, so a keyset page boundary has to land on a tie.
      lastName: id % 5 === 0 ? 'Shared' : `Person${id}`,
      email: `test${id}@paybands.example`,
      gender: genderOf(id, departmentId),
      hireDate,
      terminationDate: LANDMARKS.leaverEmployeeIds.includes(id) ? addDays(hireDate, 1200) : null,
      countryCode: unbanded
        ? LANDMARKS.unbandedCountry
        : (COUNTRY_CYCLE[id % COUNTRY_CYCLE.length] ?? 'US'),
      departmentId,
      jobLevelId: unbanded
        ? LANDMARKS.unbandedJobLevelId
        : (LEVEL_CYCLE[id % LEVEL_CYCLE.length] ?? 1),
      // Managers are drawn from the first four, none of whom leave — a report that filters
      // leavers out should never lose a manager (lessons.md, phase 3).
      managerId: id <= 4 ? null : (id % 4) + 1,
    };
  });
}

/**
 * One to three records each, built backwards from the current one so the open record carries
 * the target comp ratio and the earlier ones are what it grew from. The last record stays open
 * even for a leaver, which is what the shipped seed does.
 */
function buildSalaryRecords(employees: readonly EmployeeRow[], bands: readonly PayBandRow[]) {
  const bandByLevelAndCountry = new Map(
    bands.map((band) => [`${band.jobLevelId}:${band.countryCode}`, band]),
  );
  const records: SalaryRecordRow[] = [];

  for (const employee of employees) {
    const band = bandByLevelAndCountry.get(`${employee.jobLevelId}:${employee.countryCode}`);
    const currencyCode = CURRENCY_BY_COUNTRY.get(employee.countryCode) ?? 'USD';
    const ratio = compRatio(employee.id, employee.departmentId, employee.gender);
    // The unbanded employee still gets paid; there is just nothing to measure it against.
    const currentMinor =
      band === undefined ? 9_000_000n : scale(band.midMinor, Math.round(ratio * 10_000), 10_000n);

    const count = 1 + ((employee.id - 1) % 3);
    const dates = [0, 400, 800].slice(0, count).map((offset) => addDays(employee.hireDate, offset));

    let amountMinor = currentMinor;
    let effectiveTo: Date | null = null;
    for (let index = count - 1; index >= 0; index -= 1) {
      const effectiveFrom = dates[index];
      if (effectiveFrom === undefined) throw new RangeError('fixture date list is short');

      records[records.length] = {
        id: records.length + 1,
        employeeId: employee.id,
        amountMinor,
        currencyCode,
        effectiveFrom,
        effectiveTo,
        reason: index === 0 ? 'hire' : index === 1 ? 'merit' : 'promotion',
      };
      effectiveTo = effectiveFrom;
      amountMinor = scale(amountMinor, 100, 108n);
    }
  }

  // Built newest first per employee; ids read better ascending by date.
  return records.sort((left, right) =>
    left.employeeId === right.employeeId
      ? left.effectiveFrom.getTime() - right.effectiveFrom.getTime()
      : left.employeeId - right.employeeId,
  );
}

function scale(amountMinor: bigint, numerator: number, denominator: bigint): bigint {
  return (amountMinor * BigInt(numerator)) / denominator;
}

const employees = buildEmployees();
// One combination is missing on purpose, so an employee with no band exists to report.
const payBands = buildPayBands().filter(
  (band) =>
    !(
      band.jobLevelId === LANDMARKS.unbandedJobLevelId &&
      band.countryCode === LANDMARKS.unbandedCountry
    ),
);
const appUsers: AppUserRow[] = [
  { id: 1, email: 'hr@paybands.example', displayName: 'Test HR Manager' },
];

export const FIXTURE = {
  currencies: CURRENCIES,
  countries: COUNTRIES,
  fxRates: FX_RATES,
  departments: DEPARTMENTS,
  jobLevels: JOB_LEVELS,
  payBands,
  employees,
  salaryRecords: buildSalaryRecords(employees, payBands),
  appUsers,
  today: TODAY,
} as const;
