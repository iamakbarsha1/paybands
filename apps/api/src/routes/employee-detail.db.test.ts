import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { buildApp, type App } from '../app';
import { hasTestDatabase, resetAndSeed, testPrisma } from '../testing/db';
import { LANDMARKS } from '../testing/fixture';

interface Detail {
  employee: { id: number; status: string; departmentName: string; jobLevelName: string };
  salaryHistory: {
    amountMinor: string;
    currencyCode: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    reason: string;
  }[];
  currentSalary: { amountMinor: string; currencyCode: string } | null;
  band: { minMinor: string; midMinor: string; maxMinor: string; currencyCode: string } | null;
  compRatio: number | null;
  rangePenetration: number | null;
}

describe.skipIf(!hasTestDatabase())('GET /employees/:id', () => {
  let prisma: PrismaClient;
  let app: App;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = buildApp({ prisma });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function detail(id: number | string): Promise<{ status: number; body: Detail }> {
    const response = await app.inject({ method: 'GET', url: `/employees/${id}` });
    return { status: response.statusCode, body: response.json<Detail>() };
  }

  it('answers with the person and the names behind their ids', async () => {
    const { status, body } = await detail(1);

    expect(status).toBe(200);
    expect(body.employee.id).toBe(1);
    expect(body.employee.departmentName).not.toBe('');
    expect(body.employee.jobLevelName).toMatch(/^L\d$/);
  });

  it('orders the salary timeline oldest first and leaves the current record open', async () => {
    // Employee 3 is the first with three records: 1 + ((id - 1) % 3).
    const { body } = await detail(3);

    expect(body.salaryHistory).toHaveLength(3);
    expect(body.salaryHistory.map((record) => record.effectiveFrom)).toEqual(
      [...body.salaryHistory].map((record) => record.effectiveFrom).sort(),
    );
    expect(body.salaryHistory.at(0)?.reason).toBe('hire');
    expect(body.salaryHistory.at(-1)?.effectiveTo).toBeNull();
    expect(body.currentSalary?.amountMinor).toBe(body.salaryHistory.at(-1)?.amountMinor);
  });

  it('measures the planted outliers against their band', async () => {
    const { body: below } = await detail(LANDMARKS.belowBandEmployeeId);
    expect(below.compRatio).toBeCloseTo(0.7, 3);
    // min is 80% of mid and max is 120%, so a 0.7 ratio sits a quarter of a band below the floor.
    expect(below.rangePenetration).toBeCloseTo(-0.25, 3);

    const { body: above } = await detail(LANDMARKS.aboveBandEmployeeId);
    expect(above.compRatio).toBeCloseTo(1.3, 3);
    expect(above.rangePenetration).toBeCloseTo(1.25, 3);
  });

  it('still answers for an employee with no band', async () => {
    const { status, body } = await detail(LANDMARKS.unbandedEmployeeId);

    expect(status).toBe(200);
    expect(body.band).toBeNull();
    expect(body.compRatio).toBeNull();
    expect(body.rangePenetration).toBeNull();
    expect(body.currentSalary).not.toBeNull();
  });

  it('says who has left', async () => {
    const { body } = await detail(LANDMARKS.leaverEmployeeIds[0] ?? 0);

    expect(body.employee.status).toBe('left');
    expect(body.salaryHistory.length).toBeGreaterThan(0);
  });

  it('is a 404 for an id nobody holds, and a 400 for an id that is not one', async () => {
    expect((await detail(9_999)).status).toBe(404);
    expect((await detail('abc')).status).toBe(400);
  });
});
