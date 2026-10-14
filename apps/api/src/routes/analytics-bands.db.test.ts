import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { buildApp, type App } from '../app';
import { hasTestDatabase, resetAndSeed, testPrisma } from '../testing/db';
import { FIXTURE, LANDMARKS } from '../testing/fixture';

interface BandRow {
  jobLevelId: number;
  jobLevelName: string;
  countryCode: string;
  currencyCode: string;
  minMinor: string;
  midMinor: string;
  maxMinor: string;
  headcount: number;
}

const ACTIVE = FIXTURE.employees.filter((employee) => employee.terminationDate === null);

describe.skipIf(!hasTestDatabase())('GET /analytics/bands', () => {
  let prisma: PrismaClient;
  let app: App;
  let bands: BandRow[];

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = buildApp({ prisma });
    bands = (await read()).bands;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function read(query = ''): Promise<{ status: number; bands: BandRow[] }> {
    const response = await app.inject({ method: 'GET', url: `/analytics/bands${query}` });
    return { status: response.statusCode, bands: response.json<{ bands: BandRow[] }>().bands };
  }

  it('lists every band, not only the occupied ones', async () => {
    expect(bands).toHaveLength(FIXTURE.payBands.length);
    expect(bands.some((band) => band.headcount === 0)).toBe(true);
  });

  it('counts the people standing in each band, and nobody twice', () => {
    const total = bands.reduce((sum, band) => sum + band.headcount, 0);
    // Everyone active except the one whose level and country have no band at all.
    expect(total).toBe(ACTIVE.length - 1);

    const crowded = bands.find((band) => band.headcount > 0);
    expect(crowded).toBeDefined();
  });

  it('leaves the employee with no band out rather than inventing one', () => {
    const missing = bands.find(
      (band) =>
        band.jobLevelId === LANDMARKS.unbandedJobLevelId &&
        band.countryCode === LANDMARKS.unbandedCountry,
    );
    expect(missing).toBeUndefined();
  });

  it('carries the three figures in the band currency, in order', () => {
    for (const band of bands) {
      expect(BigInt(band.minMinor)).toBeLessThan(BigInt(band.midMinor));
      expect(BigInt(band.midMinor)).toBeLessThan(BigInt(band.maxMinor));
      expect(band.currencyCode).toMatch(/^[A-Z]{3}$/);
      expect(band.jobLevelName).toMatch(/^L\d$/);
    }
  });

  it('filters by country and by level, and refuses anything else', async () => {
    const { bands: gb } = await read('?country=GB');
    expect(gb.every((band) => band.countryCode === 'GB')).toBe(true);
    expect(gb).toHaveLength(FIXTURE.payBands.filter((band) => band.countryCode === 'GB').length);

    const { bands: third } = await read('?level=3');
    expect(third.every((band) => band.jobLevelId === 3)).toBe(true);

    const response = await app.inject({ method: 'GET', url: '/analytics/bands?levle=3' });
    expect(response.statusCode).toBe(400);
  });

  it('counts only the people still here', async () => {
    const leaver = await prisma.employee.findUniqueOrThrow({
      where: { id: LANDMARKS.leaverEmployeeIds[0] ?? 0 },
    });
    const theirBand = bands.find(
      (band) => band.jobLevelId === leaver.jobLevelId && band.countryCode === leaver.countryCode,
    );
    const stillHere = ACTIVE.filter(
      (employee) =>
        employee.jobLevelId === leaver.jobLevelId && employee.countryCode === leaver.countryCode,
    ).length;

    expect(theirBand?.headcount).toBe(stillHere);
  });
});
