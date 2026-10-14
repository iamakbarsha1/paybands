import { money, payGap, toUsd, type FxRate, type GenderedSalary } from '@paybands/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { buildApp, type App } from '../app';
import { hasTestDatabase, resetAndSeed, testPrisma } from '../testing/db';
import { FIXTURE, LANDMARKS } from '../testing/fixture';

interface Gap {
  key: string;
  name: string;
  headcount: number;
  compared: { male: number; female: number };
  excluded: number;
  suppressed: boolean;
  reason: string | null;
  meanGap: number | null;
  medianGap: number | null;
}

interface Body {
  groupBy: string;
  currency: string;
  minGroupSize: number;
  overall: Omit<Gap, 'key' | 'name'>;
  groups: Gap[];
}

const ACTIVE = FIXTURE.employees.filter((employee) => employee.terminationDate === null);
const OPEN = new Map(
  FIXTURE.salaryRecords
    .filter((record) => record.effectiveTo === null)
    .map((record) => [record.employeeId, record]),
);
const RATES: FxRate[] = FIXTURE.fxRates.map((rate) => ({
  currency: rate.currencyCode,
  rateToUsdMicros: rate.rateToUsdMicros,
  effectiveFrom: rate.effectiveFrom,
  effectiveTo: rate.effectiveTo,
}));

/** The slice as the endpoint should see it: active, paid, normalised to USD. */
function sliceOf(departmentId: number): GenderedSalary[] {
  return ACTIVE.filter((employee) => employee.departmentId === departmentId).flatMap((employee) => {
    const record = OPEN.get(employee.id);
    if (record === undefined) return [];
    return [
      {
        gender: employee.gender,
        salary: toUsd(money(record.amountMinor, record.currencyCode), RATES, new Date()),
      },
    ];
  });
}

describe.skipIf(!hasTestDatabase())('GET /analytics/pay-gap', () => {
  let prisma: PrismaClient;
  let app: App;
  let byDepartment: Body;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = buildApp({ prisma });
    byDepartment = (await read('department')).body;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function read(groupBy: string): Promise<{ status: number; body: Body }> {
    const response = await app.inject({
      method: 'GET',
      url: `/analytics/pay-gap?groupBy=${groupBy}`,
    });
    return { status: response.statusCode, body: response.json<Body>() };
  }

  it('states the minimum group size it applied', () => {
    expect(byDepartment.minGroupSize).toBe(LANDMARKS.suppressionFloor);
    expect(byDepartment.currency).toBe('USD');
  });

  it('reports the department carrying the planted gap', () => {
    const sales = byDepartment.groups.find(
      (group) => group.key === String(LANDMARKS.salesDepartmentId),
    );
    const expected = payGap(sliceOf(LANDMARKS.salesDepartmentId), {
      minGroupSize: LANDMARKS.suppressionFloor,
    });

    expect(sales?.suppressed).toBe(false);
    expect(sales?.reason).toBeNull();
    expect(sales?.meanGap).toBe(expected.meanGap);
    expect(sales?.medianGap).toBe(expected.medianGap);
    expect(sales?.compared.male).toBeGreaterThanOrEqual(LANDMARKS.suppressionFloor);
    expect(sales?.compared.female).toBeGreaterThanOrEqual(LANDMARKS.suppressionFloor);

    // The direction of the planted gap is a fact about the shipped seed, not about this
    // fixture: over fifty people the level and country mix outweighs the 0.92/1.04 plant and
    // the sign flips. `seed/generate.test.ts` is where Sales at 11.7% is asserted, the same
    // split decision 42 makes for Legal.
  });

  it('withholds the department that is too small to compare, and says why', () => {
    const legal = byDepartment.groups.find(
      (group) => group.key === String(LANDMARKS.legalDepartmentId),
    );

    expect(legal?.suppressed).toBe(true);
    expect(legal?.meanGap).toBeNull();
    expect(legal?.medianGap).toBeNull();
    expect(legal?.reason).toContain(String(LANDMARKS.suppressionFloor));
    // The people are still counted: a suppressed slice is a stated refusal, not a blank row.
    expect(legal?.headcount).toBeGreaterThan(0);
  });

  it('accounts for everyone in the slice, compared or not', () => {
    for (const group of byDepartment.groups) {
      expect(group.compared.male + group.compared.female + group.excluded).toBe(group.headcount);
    }

    const total = byDepartment.groups.reduce((sum, group) => sum + group.headcount, 0);
    expect(total).toBe(ACTIVE.length);
    expect(byDepartment.overall.headcount).toBe(ACTIVE.length);
  });

  it('counts undisclosed and other genders as excluded rather than dropping them', () => {
    const excluded = byDepartment.groups.reduce((sum, group) => sum + group.excluded, 0);
    const expected = ACTIVE.filter(
      (employee) => employee.gender !== 'male' && employee.gender !== 'female',
    ).length;

    expect(expected).toBeGreaterThan(0);
    expect(excluded).toBe(expected);
  });

  it('lists every department the reference table knows', () => {
    expect(byDepartment.groups).toHaveLength(FIXTURE.departments.length);
  });

  it('groups by country on the same shape', async () => {
    const { body } = await read('country');
    expect(body.groups).toHaveLength(FIXTURE.countries.length);
    expect(body.groups.reduce((sum, group) => sum + group.headcount, 0)).toBe(ACTIVE.length);
  });

  it('refuses a grouping outside the allowed set', async () => {
    expect((await read('gender')).status).toBe(400);
  });
});
