import { type CurrencyCode, type Gender, type SalaryReason } from '@paybands/core';
import { NAMES } from './names';
import {
  COMP_RATIO_DEFAULT,
  COMP_RATIO_MAX,
  COMP_RATIO_MIN,
  COMP_RATIO_SALES_FEMALE,
  COMP_RATIO_SALES_MALE,
  COUNTRIES,
  COUNTRY_WEIGHTS,
  CURRENCIES,
  DEPARTMENTS,
  DEPARTMENT_WEIGHTS,
  EMPLOYEE_COUNT,
  FX_RATES,
  GENDER_WEIGHTS,
  HIRE_FROM,
  HIRE_TO,
  JOB_LEVELS,
  LEGAL,
  LEVEL_PYRAMID_PERCENT,
  MERIT_GROWTH,
  OUTLIERS_ABOVE_BAND,
  OUTLIERS_BELOW_BAND,
  PROMOTION_GROWTH,
  SALES_DEPARTMENT_ID,
  TERMINATION_EARLIEST_DAYS,
  TERMINATION_RATE,
  TODAY,
  buildPayBands,
  type CompRatioTarget,
  type CountryCode,
  type CountryRow,
  type CurrencyRow,
  type DepartmentRow,
  type FxRateRow,
  type JobLevelRow,
  type PayBandRow,
} from './reference';
import {
  addDays,
  dateBetween,
  daysBetween,
  int,
  mulberry32,
  pick,
  weighted,
  type Rng,
} from './rng';

export const SEED = 20_261_013;

export interface EmployeeRow {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: Gender;
  hireDate: Date;
  terminationDate: Date | null;
  countryCode: CountryCode;
  departmentId: number;
  jobLevelId: number;
  managerId: number | null;
}

export interface SalaryRecordRow {
  id: number;
  employeeId: number;
  amountMinor: bigint;
  currencyCode: CurrencyCode;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  reason: SalaryReason;
}

/** The password hash is added by the writer, because argon2 is async and `generate` is not. */
export interface AppUserRow {
  id: number;
  email: string;
  displayName: string;
}

export interface SeedData {
  currencies: CurrencyRow[];
  countries: CountryRow[];
  fxRates: FxRateRow[];
  departments: DepartmentRow[];
  jobLevels: JobLevelRow[];
  payBands: PayBandRow[];
  employees: EmployeeRow[];
  salaryRecords: SalaryRecordRow[];
  appUsers: AppUserRow[];
}

export const HR_EMAIL = 'hr@paybands.example';
export const HR_DISPLAY_NAME = 'Alex Okonjo';

export function generate(seed: number): SeedData {
  const rng = mulberry32(seed);
  const payBands = buildPayBands();
  const employees = generateEmployees(rng);

  return {
    currencies: CURRENCIES,
    countries: COUNTRIES,
    fxRates: FX_RATES,
    departments: DEPARTMENTS,
    jobLevels: JOB_LEVELS,
    payBands,
    employees,
    salaryRecords: generateSalaryRecords(rng, employees, payBands),
    appUsers: [{ id: 1, email: HR_EMAIL, displayName: HR_DISPLAY_NAME }],
  };
}

const DAYS_PER_MONTH = 30.4375;

function months(count: number): number {
  return Math.round(count * DAYS_PER_MONTH);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function generateEmployees(rng: Rng): EmployeeRow[] {
  const levels = JOB_LEVELS.map((level, index) => ({
    level,
    headcount: ((LEVEL_PYRAMID_PERCENT[index] ?? 0) * EMPLOYEE_COUNT) / 100,
  })).reverse();

  const legalSlots = new Set<number>();
  while (legalSlots.size < LEGAL.male + LEGAL.female) {
    legalSlots.add(int(rng, 0, EMPLOYEE_COUNT - 1));
  }
  let legalMaleRemaining = LEGAL.male;
  let legalFemaleRemaining = LEGAL.female;
  const drawLegalGender = (): Gender => {
    const gender = weighted(rng, [
      ['male', legalMaleRemaining],
      ['female', legalFemaleRemaining],
    ] as const);
    if (gender === 'male') {
      legalMaleRemaining -= 1;
    } else {
      legalFemaleRemaining -= 1;
    }
    return gender;
  };

  const employees: EmployeeRow[] = [];
  const managersByDepartment = new Map<number, number[]>();

  // Levels descend so a manager's id is always lower than their report's. The writer inserts in
  // chunks against a live foreign key, so a row may never reference one a later chunk creates.
  for (const { level, headcount } of levels) {
    const atThisLevel: EmployeeRow[] = [];

    for (let n = 0; n < headcount; n += 1) {
      const id = employees.length + atThisLevel.length + 1;
      const isLegal = legalSlots.has(id - 1);
      const departmentId = isLegal ? LEGAL.departmentId : weighted(rng, DEPARTMENT_WEIGHTS);
      const gender: Gender = isLegal ? drawLegalGender() : weighted(rng, GENDER_WEIGHTS);

      const countryCode = weighted(rng, COUNTRY_WEIGHTS);
      const names = NAMES[countryCode];
      const firstName = pick(
        rng,
        gender === 'female' ? names.female : gender === 'male' ? names.male : names.all,
      );
      const lastName = pick(rng, names.last);

      const draw = rng();
      // The fourth root of the cube is `draw ** 0.75` computed only with `Math.sqrt`, which every
      // engine takes from the hardware IEEE 754 instruction where `Math.pow` is an approximation.
      const skewedToRecent = Math.sqrt(Math.sqrt(draw * draw * draw));
      const hireDate = addDays(
        HIRE_FROM,
        Math.floor(skewedToRecent * daysBetween(HIRE_FROM, HIRE_TO)),
      );
      const leaveWindowStart = addDays(hireDate, TERMINATION_EARLIEST_DAYS);
      const leaves = rng() < TERMINATION_RATE && daysBetween(leaveWindowStart, TODAY) >= 1;

      const candidates = managersByDepartment.get(departmentId);

      atThisLevel.push({
        id,
        employeeCode: `E${String(id).padStart(5, '0')}`,
        firstName,
        lastName,
        email: `${firstName}.${lastName}${id}@paybands.example`.toLowerCase(),
        gender,
        hireDate,
        terminationDate: leaves ? dateBetween(rng, leaveWindowStart, TODAY) : null,
        countryCode,
        departmentId,
        jobLevelId: level.id,
        managerId: candidates === undefined ? null : pick(rng, candidates),
      });
    }

    for (const employee of atThisLevel) {
      if (employee.terminationDate !== null) {
        continue;
      }
      const peers = managersByDepartment.get(employee.departmentId);
      if (peers === undefined) {
        managersByDepartment.set(employee.departmentId, [employee.id]);
      } else {
        peers.push(employee.id);
      }
    }
    employees.push(...atThisLevel);
  }

  return employees;
}

function compRatioTarget(employee: EmployeeRow): CompRatioTarget {
  if (employee.departmentId !== SALES_DEPARTMENT_ID) {
    return COMP_RATIO_DEFAULT;
  }
  if (employee.gender === 'female') {
    return COMP_RATIO_SALES_FEMALE;
  }
  if (employee.gender === 'male') {
    return COMP_RATIO_SALES_MALE;
  }
  return COMP_RATIO_DEFAULT;
}

interface SalaryPlan {
  employee: EmployeeRow;
  ratio: number;
}

function drawDistinct<T>(rng: Rng, pool: readonly T[], count: number): T[] {
  const remaining = [...pool];
  const drawn: T[] = [];
  for (let n = 0; n < count; n += 1) {
    const [value] = remaining.splice(int(rng, 0, remaining.length - 1), 1);
    if (value === undefined) {
      throw new RangeError('drawDistinct needs a pool at least as large as the count');
    }
    drawn.push(value);
  }
  return drawn;
}

const RATIO_SCALE = 1_000_000;

function applyRatio(midMinor: bigint, ratio: number): bigint {
  const scaled = BigInt(Math.round(ratio * RATIO_SCALE));
  return (midMinor * scaled + BigInt(RATIO_SCALE / 2)) / BigInt(RATIO_SCALE);
}

function undoGrowth(amountMinor: bigint, factor: number): bigint {
  const scaled = BigInt(Math.round(factor * RATIO_SCALE));
  return (amountMinor * BigInt(RATIO_SCALE) + scaled / 2n) / scaled;
}

function generateSalaryRecords(
  rng: Rng,
  employees: EmployeeRow[],
  payBands: PayBandRow[],
): SalaryRecordRow[] {
  const bandByLevelAndCountry = new Map(
    payBands.map((band) => [`${band.jobLevelId}:${band.countryCode}`, band]),
  );

  const plans: SalaryPlan[] = employees.map((employee) => {
    const { center, spread } = compRatioTarget(employee);
    const u = (rng() + rng() + rng()) / 3;
    return {
      employee,
      ratio: clamp(center + (u - 0.5) * 2 * spread, COMP_RATIO_MIN, COMP_RATIO_MAX),
    };
  });

  const eligible = plans.filter(
    ({ employee }) =>
      employee.terminationDate === null &&
      employee.departmentId !== SALES_DEPARTMENT_ID &&
      employee.departmentId !== LEGAL.departmentId,
  );
  const outliers = drawDistinct(
    rng,
    eligible,
    OUTLIERS_BELOW_BAND.count + OUTLIERS_ABOVE_BAND.count,
  );
  outliers.forEach((plan, index) => {
    const band = index < OUTLIERS_BELOW_BAND.count ? OUTLIERS_BELOW_BAND : OUTLIERS_ABOVE_BAND;
    plan.ratio = band.min + rng() * (band.max - band.min);
  });

  const records: SalaryRecordRow[] = [];
  for (const { employee, ratio } of plans) {
    const band = bandByLevelAndCountry.get(`${employee.jobLevelId}:${employee.countryCode}`);
    if (band === undefined) {
      throw new Error(`No pay band for level ${employee.jobLevelId} in ${employee.countryCode}`);
    }
    records.push(...salaryHistory(rng, employee, ratio, band, records.length + 1));
  }
  return records;
}

function salaryHistory(
  rng: Rng,
  employee: EmployeeRow,
  ratio: number,
  band: PayBandRow,
  startId: number,
): SalaryRecordRow[] {
  // A leaver's history ends the day they left. The 30 day margin only serves someone still here,
  // whose current record should not be dated yesterday.
  const windowEnd = employee.terminationDate ?? addDays(TODAY, -30);
  const windowStart = addDays(employee.hireDate, months(9));
  const windowDays = daysBetween(windowStart, windowEnd);

  const lastDay = employee.terminationDate ?? TODAY;
  const tenureMonths = Math.floor(daysBetween(employee.hireDate, lastDay) / DAYS_PER_MONTH);
  const byTenure = 1 + Math.floor(tenureMonths / 9);
  // A raise needs a day of its own between the first review and a month ago, so the window caps
  // the count independently of tenure.
  const capacity = windowDays >= 1 ? Math.min(byTenure, 1 + windowDays) : 1;
  const count = Math.min(int(rng, 3, 5), capacity);
  const promotionIndex = count >= 3 ? int(rng, 1, count - 1) : -1;

  const dates = [employee.hireDate];
  for (let slot = 0; slot < count - 1; slot += 1) {
    const from = Math.floor((slot * windowDays) / (count - 1));
    const to = Math.floor(((slot + 1) * windowDays) / (count - 1));
    dates.push(addDays(windowStart, from + int(rng, 0, to - from - 1)));
  }

  const rows: SalaryRecordRow[] = [];
  let amountMinor = applyRatio(band.midMinor, ratio);
  let effectiveTo: Date | null = null;

  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const effectiveFrom = dates[index];
    if (effectiveFrom === undefined) {
      throw new RangeError('salaryHistory walked past the start of its own date list');
    }
    rows[index] = {
      id: startId + index,
      employeeId: employee.id,
      amountMinor,
      currencyCode: band.currencyCode,
      effectiveFrom,
      effectiveTo,
      reason: index === 0 ? 'hire' : index === promotionIndex ? 'promotion' : 'merit',
    };
    effectiveTo = effectiveFrom;

    if (index > 0) {
      const growth = index === promotionIndex ? PROMOTION_GROWTH : MERIT_GROWTH;
      amountMinor = undoGrowth(amountMinor, growth.min + rng() * (growth.max - growth.min));
    }
  }

  return rows;
}
