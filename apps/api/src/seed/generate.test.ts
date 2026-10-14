import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMP_RATIO_THRESHOLD, money, outliers, type BandedSalary } from '@paybands/core';
import { SEED, generate, type EmployeeRow, type SalaryRecordRow, type SeedData } from './generate';
import {
  COMP_RATIO_MAX,
  COMP_RATIO_MIN,
  OUTLIERS_ABOVE_BAND,
  OUTLIERS_BELOW_BAND,
} from './reference';

/**
 * Pins the generator's output across versions. The deep-equal above it cannot see a clock read
 * that happens once at module load, because both calls in a run would then agree.
 */
const CANONICAL_SHA256 = '895550fe7cd91827d126b63488210c671d33e3267e9fb464459a93ae8e0dea10';

function canonicalHash(data: SeedData): string {
  const json = JSON.stringify(data, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
  return createHash('sha256').update(json).digest('hex');
}

/** docs/data-model.md §2: the one predicate for "the row in force on this date". */
function inForceOn(
  rows: readonly { effectiveFrom: Date; effectiveTo: Date | null }[],
  on: Date,
): boolean {
  return rows.some(
    (row) => row.effectiveFrom <= on && (row.effectiveTo === null || row.effectiveTo > on),
  );
}

describe('generate', () => {
  const data = generate(SEED);

  const bandByEmployee = (() => {
    const bands = new Map(
      data.payBands.map((band) => [`${band.jobLevelId}:${band.countryCode}`, band]),
    );
    return (employee: EmployeeRow) => {
      const band = bands.get(`${employee.jobLevelId}:${employee.countryCode}`);
      if (band === undefined) {
        throw new Error(`No pay band for employee ${employee.id}`);
      }
      return band;
    };
  })();

  const currentSalary = (() => {
    const open = new Map(
      data.salaryRecords
        .filter((record) => record.effectiveTo === null)
        .map((r) => [r.employeeId, r]),
    );
    return (employee: EmployeeRow) => {
      const record = open.get(employee.id);
      if (record === undefined) {
        throw new Error(`No open salary record for employee ${employee.id}`);
      }
      return record;
    };
  })();

  const meanCompRatio = (employees: EmployeeRow[]) =>
    employees.reduce(
      (sum, employee) =>
        sum +
        Number(currentSalary(employee).amountMinor) / Number(bandByEmployee(employee).midMinor),
      0,
    ) / employees.length;

  it('returns the same data from two calls in one process', () => {
    expect(generate(SEED)).toEqual(generate(SEED));
  });

  it('matches the committed hash of its canonical JSON', () => {
    expect(canonicalHash(data)).toBe(CANONICAL_SHA256);
  });

  it('fills every table to its expected size', () => {
    expect(data.countries).toHaveLength(6);
    expect(data.currencies).toHaveLength(6);
    expect(data.jobLevels).toHaveLength(8);
    expect(data.departments).toHaveLength(10);
    expect(data.payBands).toHaveLength(48);
    expect(data.employees).toHaveLength(10_000);
  });

  it('prices every band clear of the comp ratio clamp and of the planted outlier ranges', () => {
    for (const band of data.payBands) {
      const min = Number(band.minMinor) / Number(band.midMinor);
      const max = Number(band.maxMinor) / Number(band.midMinor);
      expect(min).toBeLessThan(COMP_RATIO_MIN);
      expect(max).toBeGreaterThan(COMP_RATIO_MAX);
      expect(min).toBeGreaterThan(OUTLIERS_BELOW_BAND.max);
      expect(max).toBeLessThan(OUTLIERS_ABOVE_BAND.min);
    }
  });

  it('gives every employee one contiguous half-open salary chain', () => {
    const chains = new Map<number, SalaryRecordRow[]>();
    for (const record of data.salaryRecords) {
      const chain = chains.get(record.employeeId);
      if (chain === undefined) {
        chains.set(record.employeeId, [record]);
      } else {
        chain.push(record);
      }
    }
    expect(chains.size).toBe(10_000);

    const broken: string[] = [];
    for (const employee of data.employees) {
      const chain = chains.get(employee.id) ?? [];
      chain.sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());

      const first = chain[0];
      if (first === undefined) {
        broken.push(`${employee.id}: no salary records`);
        continue;
      }
      if (
        first.reason !== 'hire' ||
        first.effectiveFrom.getTime() !== employee.hireDate.getTime()
      ) {
        broken.push(`${employee.id}: first record is not a hire dated the hire date`);
      }
      if (chain.filter((record) => record.effectiveTo === null).length !== 1) {
        broken.push(`${employee.id}: not exactly one open record`);
      }
      if (chain.at(-1)?.effectiveTo !== null) {
        broken.push(`${employee.id}: the open record is not the last one`);
      }
      if (chain.filter((record) => record.reason === 'promotion').length > 1) {
        broken.push(`${employee.id}: more than one promotion`);
      }
      for (let index = 1; index < chain.length; index += 1) {
        const previous = chain[index - 1];
        const record = chain[index];
        if (previous === undefined || record === undefined) {
          continue;
        }
        if (previous.effectiveTo?.getTime() !== record.effectiveFrom.getTime()) {
          broken.push(`${employee.id}: gap or overlap at record ${index}`);
        }
        if (record.amountMinor <= previous.amountMinor) {
          broken.push(`${employee.id}: amount does not rise at record ${index}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('plants 40 salaries below band minimum and 25 above, all on active employees', () => {
    const below: EmployeeRow[] = [];
    const above: EmployeeRow[] = [];
    for (const employee of data.employees) {
      const band = bandByEmployee(employee);
      const amount = currentSalary(employee).amountMinor;
      if (amount < band.minMinor) below.push(employee);
      if (amount > band.maxMinor) above.push(employee);
    }
    expect([...below, ...above].filter((employee) => employee.terminationDate !== null)).toEqual(
      [],
    );
    expect(below).toHaveLength(40);
    expect(above).toHaveLength(25);
  });

  it('agrees with the core outlier report on exactly who is out of band', () => {
    // The seed plants outliers by comp ratio; the report finds them by comparing
    // against min and max. Nothing related the two until this test.
    const active = data.employees.filter((employee) => employee.terminationDate === null);
    const rows: BandedSalary[] = active.map((employee) => {
      const band = bandByEmployee(employee);
      const record = currentSalary(employee);
      return {
        employeeId: employee.id,
        salary: money(record.amountMinor, record.currencyCode),
        band: {
          min: money(band.minMinor, band.currencyCode),
          mid: money(band.midMinor, band.currencyCode),
          max: money(band.maxMinor, band.currencyCode),
        },
      };
    });

    const found = outliers(rows, DEFAULT_COMP_RATIO_THRESHOLD);
    const byHand = {
      below: active
        .filter((e) => currentSalary(e).amountMinor < bandByEmployee(e).minMinor)
        .map((e) => e.id),
      above: active
        .filter((e) => currentSalary(e).amountMinor > bandByEmployee(e).maxMinor)
        .map((e) => e.id),
    };

    expect(found.belowBand.map((entry) => entry.employeeId)).toEqual(byHand.below);
    expect(found.aboveBand.map((entry) => entry.employeeId)).toEqual(byHand.above);
    expect(found.belowBand).toHaveLength(OUTLIERS_BELOW_BAND.count);
    expect(found.aboveBand).toHaveLength(OUTLIERS_ABOVE_BAND.count);
    expect(found.noBand).toEqual([]);
  });

  it('has a pay band and an FX rate in force on every salary record date', () => {
    const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]));
    const uncovered = data.salaryRecords.filter((record) => {
      const employee = employeeById.get(record.employeeId);
      if (employee === undefined) {
        return true;
      }
      const bands = data.payBands.filter(
        (band) =>
          band.jobLevelId === employee.jobLevelId && band.countryCode === employee.countryCode,
      );
      const rates = data.fxRates.filter((rate) => rate.currencyCode === record.currencyCode);
      return !inForceOn(bands, record.effectiveFrom) || !inForceOn(rates, record.effectiveFrom);
    });
    expect(uncovered).toEqual([]);
  });

  it('gives Sales a reportable gender gap and Legal one too small to report', () => {
    const sales = data.employees.filter((employee) => employee.departmentId === 2);
    const female = meanCompRatio(sales.filter((employee) => employee.gender === 'female'));
    const male = meanCompRatio(sales.filter((employee) => employee.gender === 'male'));
    expect(female).toBeLessThanOrEqual(male * 0.92);

    const legal = data.employees.filter((employee) => employee.departmentId === 10);
    expect(legal).toHaveLength(11);
    expect(legal.filter((employee) => employee.gender === 'female')).toHaveLength(3);
    expect(legal.filter((employee) => employee.gender === 'male')).toHaveLength(8);
  });

  it('never pays a leaver after the day they left', () => {
    const terminated = new Map(
      data.employees
        .filter((employee) => employee.terminationDate !== null)
        .map((employee) => [employee.id, employee.terminationDate]),
    );
    const afterLeaving = data.salaryRecords.filter((record) => {
      const leftOn = terminated.get(record.employeeId);
      return leftOn !== undefined && leftOn !== null && record.effectiveFrom > leftOn;
    });
    expect(afterLeaving).toEqual([]);
  });

  it('never points an employee at a terminated manager', () => {
    const terminated = new Set(
      data.employees
        .filter((employee) => employee.terminationDate !== null)
        .map((employee) => employee.id),
    );
    const reportingToLeaver = data.employees.filter(
      (employee) => employee.managerId !== null && terminated.has(employee.managerId),
    );
    expect(reportingToLeaver).toEqual([]);
  });

  it("keeps every manager's id below their report's, which the chunked insert requires", () => {
    const wrongWay = data.employees.filter(
      (employee) => employee.managerId !== null && employee.managerId >= employee.id,
    );
    expect(wrongWay).toEqual([]);
  });
});
