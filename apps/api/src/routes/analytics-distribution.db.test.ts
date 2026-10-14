import { money, percentiles, toUsd, type FxRate } from '@paybands/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { buildApp, type App } from '../app';
import { hasTestDatabase, resetAndSeed, testPrisma } from '../testing/db';
import { FIXTURE } from '../testing/fixture';

interface Points {
  p25: string;
  p50: string;
  p75: string;
  p90: string;
}

interface Slice {
  key: string;
  name: string;
  headcount: number;
  percentiles: Points | null;
}

interface Body {
  groupBy: string;
  currency: string;
  groups: Slice[];
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

describe.skipIf(!hasTestDatabase())('GET /analytics/distribution', () => {
  let prisma: PrismaClient;
  let app: App;
  let byCountry: Slice[];

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = buildApp({ prisma });
    byCountry = (await read('country')).body.groups;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function read(groupBy: string): Promise<{ status: number; body: Body }> {
    const response = await app.inject({
      method: 'GET',
      url: `/analytics/distribution?groupBy=${groupBy}`,
    });
    return { status: response.statusCode, body: response.json<Body>() };
  }

  it('lists every country, not only the ones somebody works in', () => {
    expect(byCountry).toHaveLength(FIXTURE.countries.length);
    expect(byCountry.map((group) => group.key).sort()).toEqual(
      FIXTURE.countries.map((country) => country.code).sort(),
    );
    expect(byCountry.every((group) => group.name !== '')).toBe(true);
  });

  it('counts the people still here, once each, and nobody who left', () => {
    const total = byCountry.reduce((sum, group) => sum + group.headcount, 0);
    expect(total).toBe(ACTIVE.length);

    for (const group of byCountry) {
      const expected = ACTIVE.filter((employee) => employee.countryCode === group.key).length;
      expect(group.headcount).toBe(expected);
    }
  });

  it('reports a level nobody holds as an empty group rather than dropping it', async () => {
    const { body } = await read('level');
    expect(body.groups).toHaveLength(FIXTURE.jobLevels.length);

    const empty = FIXTURE.jobLevels.filter(
      (level) => !ACTIVE.some((employee) => employee.jobLevelId === level.id),
    );
    // The fixture leaves one level unoccupied on purpose; without it this test proves nothing.
    expect(empty.length).toBeGreaterThan(0);

    for (const level of empty) {
      const group = body.groups.find((candidate) => candidate.key === String(level.id));
      expect(group?.headcount).toBe(0);
      expect(group?.percentiles).toBeNull();
    }
  });

  it('groups by department under the same shape', async () => {
    const { body } = await read('department');
    expect(body.groups).toHaveLength(FIXTURE.departments.length);
    expect(body.groups.reduce((sum, group) => sum + group.headcount, 0)).toBe(ACTIVE.length);
  });

  it('returns the four points in order, in USD', () => {
    expect(byCountry.every((group) => group.percentiles === null || group.headcount > 0)).toBe(
      true,
    );

    for (const group of byCountry) {
      if (group.percentiles === null) continue;
      const { p25, p50, p75, p90 } = group.percentiles;
      expect(BigInt(p25)).toBeLessThanOrEqual(BigInt(p50));
      expect(BigInt(p50)).toBeLessThanOrEqual(BigInt(p75));
      expect(BigInt(p75)).toBeLessThanOrEqual(BigInt(p90));
    }
  });

  it('normalises a non-USD country through the rate table', () => {
    const british = byCountry.find((group) => group.key === 'GB');
    const salaries = ACTIVE.filter((employee) => employee.countryCode === 'GB')
      .map((employee) => OPEN.get(employee.id))
      .filter((record) => record !== undefined)
      .map((record) => toUsd(money(record.amountMinor, record.currencyCode), RATES, new Date()));
    const expected = percentiles(salaries, [25, 50, 75, 90]);

    expect(expected).not.toBeNull();
    expect(british?.percentiles?.p50).toBe(expected?.[1]?.value.amount.toString());
    expect(british?.percentiles?.p90).toBe(expected?.[3]?.value.amount.toString());
  });

  it("matches the database's own percentile_cont on a single-currency slice", async () => {
    // The US group needs no conversion — the rate is 1:1 — so the figure the endpoint
    // returns is comparable to the one Postgres computes over the raw minor units.
    const rows = await prisma.$queryRaw<{ p25: bigint; p50: bigint; p90: bigint }[]>`
      SELECT round(percentile_cont(0.25) WITHIN GROUP (ORDER BY s.amount_minor)::numeric)::bigint AS p25,
             round(percentile_cont(0.50) WITHIN GROUP (ORDER BY s.amount_minor)::numeric)::bigint AS p50,
             round(percentile_cont(0.90) WITHIN GROUP (ORDER BY s.amount_minor)::numeric)::bigint AS p90
        FROM salary_record s
        JOIN employee e ON e.id = s.employee_id
       WHERE s.effective_to IS NULL
         AND e.termination_date IS NULL
         AND e.country_code = 'US'`;

    const sql = rows[0];
    const american = byCountry.find((group) => group.key === 'US');
    expect(sql).toBeDefined();
    expect(american?.percentiles?.p25).toBe(sql?.p25.toString());
    expect(american?.percentiles?.p50).toBe(sql?.p50.toString());
    expect(american?.percentiles?.p90).toBe(sql?.p90.toString());
  });

  it('refuses a grouping outside the allowed set, and a missing one', async () => {
    expect((await read('team')).status).toBe(400);

    const missing = await app.inject({ method: 'GET', url: '/analytics/distribution' });
    expect(missing.statusCode).toBe(400);

    const extra = await app.inject({
      method: 'GET',
      url: '/analytics/distribution?groupBy=country&region=emea',
    });
    expect(extra.statusCode).toBe(400);
  });
});
