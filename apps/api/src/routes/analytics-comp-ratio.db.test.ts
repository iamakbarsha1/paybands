import { compRatio, money } from '@paybands/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from '../testing/db';
import { FIXTURE, LANDMARKS } from '../testing/fixture';

interface Summary {
  headcount: number;
  measured: number;
  unbanded: number;
  counts: number[];
}

interface Body {
  groupBy: string;
  buckets: { from: number | null; to: number | null }[];
  overall: Summary;
  groups: (Summary & { key: string; name: string })[];
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

/** The same ratio the endpoint reports, computed from the fixture rows in local currency. */
function ratioOf(employee: (typeof ACTIVE)[number]): number | null {
  const record = OPEN.get(employee.id);
  if (record === undefined) return null;
  const band = BAND.get(`${employee.jobLevelId}:${employee.countryCode}`);
  return compRatio(
    money(record.amountMinor, record.currencyCode),
    band === undefined
      ? undefined
      : {
          min: money(band.minMinor, band.currencyCode),
          mid: money(band.midMinor, band.currencyCode),
          max: money(band.maxMinor, band.currencyCode),
        },
  );
}

function bucketOf(ratio: number, buckets: Body['buckets']): number {
  return buckets.findIndex(
    (bucket) =>
      (bucket.from === null || ratio >= bucket.from) && (bucket.to === null || ratio < bucket.to),
  );
}

function expectedCounts(
  people: readonly (typeof ACTIVE)[number][],
  buckets: Body['buckets'],
): number[] {
  const counts = buckets.map(() => 0);
  for (const employee of people) {
    const ratio = ratioOf(employee);
    if (ratio === null) continue;
    const index = bucketOf(ratio, buckets);
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}

describe.skipIf(!hasTestDatabase())('GET /analytics/comp-ratio', () => {
  let prisma: PrismaClient;
  let app: App;
  let byCountry: Body;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = testApp(prisma);
    byCountry = (await read('country')).body;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function read(groupBy: string): Promise<{ status: number; body: Body }> {
    const response = await app.inject({
      method: 'GET',
      url: `/analytics/comp-ratio?groupBy=${groupBy}`,
    });
    return { status: response.statusCode, body: response.json<Body>() };
  }

  it('states the bucket boundaries, open at both ends', () => {
    expect(byCountry.buckets.length).toBeGreaterThan(2);
    expect(byCountry.buckets[0]?.from).toBeNull();
    expect(byCountry.buckets.at(-1)?.to).toBeNull();

    for (const [index, bucket] of byCountry.buckets.entries()) {
      const next = byCountry.buckets[index + 1];
      if (next === undefined) continue;
      // No gap and no overlap: one bucket ends exactly where the next begins.
      expect(bucket.to).toBe(next.from);
    }
  });

  it('measures everyone with a band and says how many had none', () => {
    const unbanded = ACTIVE.filter((employee) => ratioOf(employee) === null).length;

    expect(byCountry.overall.headcount).toBe(ACTIVE.length);
    expect(byCountry.overall.unbanded).toBe(unbanded);
    expect(byCountry.overall.measured).toBe(ACTIVE.length - unbanded);
    expect(byCountry.overall.counts.reduce((sum, count) => sum + count, 0)).toBe(
      byCountry.overall.measured,
    );
  });

  it('counts each slice in its own local currency', () => {
    expect(byCountry.groups).toHaveLength(FIXTURE.countries.length);

    for (const group of byCountry.groups) {
      const people = ACTIVE.filter((employee) => employee.countryCode === group.key);
      expect(group.headcount).toBe(people.length);
      expect(group.counts).toEqual(expectedCounts(people, byCountry.buckets));
    }
  });

  it('reports a slice where nobody has a band as measured zero, not as an error', async () => {
    const { body } = await read('level');
    const level = body.groups.find((group) => group.key === String(LANDMARKS.unbandedJobLevelId));

    const people = ACTIVE.filter(
      (employee) => employee.jobLevelId === LANDMARKS.unbandedJobLevelId,
    );
    // The fixture puts one person on a level with no band anywhere; without them this
    // test would be asserting against an empty slice instead of an unbanded one.
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((employee) => ratioOf(employee) === null)).toBe(true);

    expect(level?.headcount).toBe(people.length);
    expect(level?.unbanded).toBe(people.length);
    expect(level?.measured).toBe(0);
    expect(level?.counts.every((count) => count === 0)).toBe(true);
  });

  it('puts the planted low and high earners in the outer buckets', () => {
    const below = ACTIVE.find((employee) => employee.id === LANDMARKS.belowBandEmployeeId);
    const above = ACTIVE.find((employee) => employee.id === LANDMARKS.aboveBandEmployeeId);
    const lowRatio = below === undefined ? null : ratioOf(below);
    const highRatio = above === undefined ? null : ratioOf(above);
    expect(lowRatio).not.toBeNull();
    expect(highRatio).not.toBeNull();

    const lowest = byCountry.buckets[0];
    const highest = byCountry.buckets.at(-1);
    expect(lowRatio ?? 0).toBeLessThan(lowest?.to ?? 0);
    expect(highRatio ?? 0).toBeGreaterThanOrEqual(highest?.from ?? 0);

    expect(byCountry.overall.counts[0]).toBeGreaterThan(0);
    expect(byCountry.overall.counts.at(-1)).toBeGreaterThan(0);
  });

  it('groups by department under the same shape', async () => {
    const { body } = await read('department');
    expect(body.groups).toHaveLength(FIXTURE.departments.length);
    expect(body.groups.reduce((sum, group) => sum + group.measured, 0)).toBe(body.overall.measured);
  });

  it('refuses a grouping outside the allowed set, and a missing one', async () => {
    expect((await read('manager')).status).toBe(400);

    const missing = await app.inject({ method: 'GET', url: '/analytics/comp-ratio' });
    expect(missing.statusCode).toBe(400);
  });
});
