import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { buildApp } from '../app';
import { hasTestDatabase, resetAndSeed, testPrisma } from './db';
import { FIXTURE, LANDMARKS } from './fixture';

/**
 * The harness proving itself. Everything phase 5 and 6 assert about SQL runs on
 * these three facts: migrations are applied, the fixture is loaded, and the run
 * starts from the same rows every time.
 */
describe.skipIf(!hasTestDatabase())('the integration harness', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loads the fixture it describes', async () => {
    expect(await prisma.employee.count()).toBe(FIXTURE.employees.length);
    expect(await prisma.salaryRecord.count()).toBe(FIXTURE.salaryRecords.length);
    expect(await prisma.payBand.count()).toBe(FIXTURE.payBands.length);
    expect(await prisma.department.count()).toBe(FIXTURE.departments.length);
  });

  it('starts every run from the same rows', async () => {
    await resetAndSeed(prisma);
    expect(await prisma.employee.count()).toBe(FIXTURE.employees.length);
    expect(await prisma.salaryRecord.count()).toBe(FIXTURE.salaryRecords.length);
  });

  it('leaves exactly one open salary record per employee', async () => {
    const open = await prisma.salaryRecord.groupBy({
      by: ['employeeId'],
      where: { effectiveTo: null },
      _count: { _all: true },
    });
    expect(open).toHaveLength(FIXTURE.employees.length);
    expect(open.every((row) => row._count._all === 1)).toBe(true);
  });

  // The partial unique index is hand-written into the migration (decision 18). If migrations
  // were skipped, the insert below succeeds and the harness is testing an empty promise.
  it('runs against a migrated database, index and all', async () => {
    const employee = FIXTURE.employees[0];
    if (employee === undefined) throw new Error('the fixture has no employees');

    await expect(
      prisma.salaryRecord.create({
        data: {
          employeeId: employee.id,
          amountMinor: 1_000_000n,
          currencyCode: 'USD',
          effectiveFrom: new Date(Date.UTC(2026, 9, 1)),
          effectiveTo: null,
          reason: 'merit',
        },
      }),
      // Named, because a primary-key collision also says "unique" — and would say it even
      // if the partial index had never been created.
    ).rejects.toThrow(/one_open_salary_per_employee/);
  });

  it('carries one of every case the reports have to render', async () => {
    const unbanded = await prisma.employee.findUniqueOrThrow({
      where: { id: LANDMARKS.unbandedEmployeeId },
    });
    const band = await prisma.payBand.findFirst({
      where: { jobLevelId: unbanded.jobLevelId, countryCode: unbanded.countryCode },
    });
    expect(band).toBeNull();

    const leavers = await prisma.employee.count({ where: { terminationDate: { not: null } } });
    expect(leavers).toBe(LANDMARKS.leaverEmployeeIds.length);

    const legal = await prisma.employee.count({
      where: { departmentId: LANDMARKS.legalDepartmentId, terminationDate: null },
    });
    expect(legal).toBeLessThan(LANDMARKS.suppressionFloor);
  });

  it('pays the planted outliers outside their band', async () => {
    for (const [employeeId, side] of [
      [LANDMARKS.belowBandEmployeeId, 'below'],
      [LANDMARKS.aboveBandEmployeeId, 'above'],
    ] as const) {
      const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
      const band = await prisma.payBand.findFirstOrThrow({
        where: { jobLevelId: employee.jobLevelId, countryCode: employee.countryCode },
      });
      const { amountMinor } = await prisma.salaryRecord.findFirstOrThrow({
        where: { employeeId, effectiveTo: null },
      });

      if (side === 'below') expect(amountMinor).toBeLessThan(band.minMinor);
      else expect(amountMinor).toBeGreaterThan(band.maxMinor);
    }
  });

  it('serves the app through inject while the database is loaded', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
