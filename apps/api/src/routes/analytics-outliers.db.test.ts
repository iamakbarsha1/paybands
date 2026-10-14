import { DEFAULT_COMP_RATIO_THRESHOLD } from '@paybands/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { buildApp, type App } from '../app';
import { hasTestDatabase, resetAndSeed, testPrisma } from '../testing/db';
import { FIXTURE, LANDMARKS } from '../testing/fixture';

interface Row {
  employeeId: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  departmentName: string;
  jobLevelName: string;
  salary: { amountMinor: string; currencyCode: string };
  compRatio: number | null;
}

interface Body {
  threshold: { min: number; max: number };
  belowBand: Row[];
  aboveBand: Row[];
  compRatioOutOfRange: Row[];
  noBand: Row[];
}

const ACTIVE = FIXTURE.employees.filter((employee) => employee.terminationDate === null);
const OPEN = new Map(
  FIXTURE.salaryRecords
    .filter((record) => record.effectiveTo === null)
    .map((record) => [record.employeeId, record]),
);
const BAND = new Map(
  FIXTURE.payBands.map((band) => [`${band.jobLevelId}:${band.countryCode}`, band]),
);

/** Raw comparison against the fixture rows, so the oracle is not the code under test. */
function outsideBand(side: 'below' | 'above'): number[] {
  return ACTIVE.filter((employee) => {
    const record = OPEN.get(employee.id);
    const band = BAND.get(`${employee.jobLevelId}:${employee.countryCode}`);
    if (record === undefined || band === undefined) return false;
    return side === 'below'
      ? record.amountMinor < band.minMinor
      : record.amountMinor > band.maxMinor;
  }).map((employee) => employee.id);
}

const ids = (rows: Row[]): number[] => rows.map((row) => row.employeeId).sort((a, b) => a - b);

describe.skipIf(!hasTestDatabase())('GET /analytics/outliers', () => {
  let prisma: PrismaClient;
  let app: App;
  let body: Body;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = buildApp({ prisma });
    const response = await app.inject({ method: 'GET', url: '/analytics/outliers' });
    body = response.json<Body>();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('states the threshold it judged against, because it is policy and not a fact', () => {
    expect(body.threshold).toEqual(DEFAULT_COMP_RATIO_THRESHOLD);
  });

  it('finds the people paid under their band minimum, and only them', () => {
    const expected = outsideBand('below');
    expect(expected).toContain(LANDMARKS.belowBandEmployeeId);
    expect(ids(body.belowBand)).toEqual(expected);
  });

  it('finds the people paid over their band maximum, and only them', () => {
    const expected = outsideBand('above');
    expect(expected).toContain(LANDMARKS.aboveBandEmployeeId);
    expect(ids(body.aboveBand)).toEqual(expected);
  });

  it('lists an employee in both the band list and the ratio list when both apply', () => {
    // Four lists rather than one count, because the conditions overlap (decision 40).
    expect(ids(body.compRatioOutOfRange)).toContain(LANDMARKS.belowBandEmployeeId);
    expect(ids(body.compRatioOutOfRange)).toContain(LANDMARKS.aboveBandEmployeeId);
    expect(body.compRatioOutOfRange.every((row) => row.compRatio !== null)).toBe(true);
  });

  it('puts the employee no band covers in their own list, with no ratio', () => {
    const expected = ACTIVE.filter(
      (employee) => !BAND.has(`${employee.jobLevelId}:${employee.countryCode}`),
    ).map((employee) => employee.id);

    expect(expected).toContain(LANDMARKS.unbandedEmployeeId);
    expect(ids(body.noBand)).toEqual(expected);
    expect(body.noBand.every((row) => row.compRatio === null)).toBe(true);
  });

  it('never reports someone who has left', async () => {
    const everyone = [
      ...body.belowBand,
      ...body.aboveBand,
      ...body.compRatioOutOfRange,
      ...body.noBand,
    ];
    for (const leaver of LANDMARKS.leaverEmployeeIds) {
      expect(everyone.some((row) => row.employeeId === leaver)).toBe(false);
    }

    // None of the seeded leavers is an outlier, so the assertion above passes whether or not
    // the query filters them. Making one of the outliers leave is what tests the filter.
    const id = LANDMARKS.belowBandEmployeeId;
    try {
      await prisma.employee.update({
        where: { id },
        data: { terminationDate: new Date(Date.UTC(2026, 0, 1)) },
      });
      const after = (await app.inject({ method: 'GET', url: '/analytics/outliers' })).json<Body>();

      expect(after.belowBand.some((row) => row.employeeId === id)).toBe(false);
      expect(after.belowBand).toHaveLength(body.belowBand.length - 1);
      expect(after.compRatioOutOfRange.some((row) => row.employeeId === id)).toBe(false);
    } finally {
      await prisma.employee.update({ where: { id }, data: { terminationDate: null } });
    }
  });

  it('carries enough of the employee to link to them', () => {
    const row = body.belowBand[0];
    expect(row).toBeDefined();
    expect(row?.employeeId).toBeGreaterThan(0);
    expect(row?.employeeCode).toMatch(/^T-\d{4}$/);
    expect(row?.firstName).not.toBe('');
    expect(row?.lastName).not.toBe('');
    expect(row?.departmentName).not.toBe('');
    expect(row?.jobLevelName).toMatch(/^L\d$/);
    expect(BigInt(row?.salary.amountMinor ?? '0')).toBeGreaterThan(0n);
    expect(row?.salary.currencyCode).toMatch(/^[A-Z]{3}$/);
  });

  it('refuses a query parameter it does not know', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/analytics/outliers?compRatioMin=0.5',
    });
    expect(response.statusCode).toBe(400);
  });
});
