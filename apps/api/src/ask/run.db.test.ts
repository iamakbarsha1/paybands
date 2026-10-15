import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { SLICE_GROUPS, type SliceGroup } from '../repositories/analytics';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from '../testing/db';
import type { AskQuery } from './query';
import { run } from './run';

/** The three reports that take a grouping. `report` is the path segment, so the URL follows. */
const SLICED = ['distribution', 'comp-ratio', 'pay-gap'] as const;

describe.skipIf(!hasTestDatabase())('run', () => {
  let prisma: PrismaClient;
  let app: App;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = testApp(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /**
   * The whole ticket in one assertion: the query object reaches the same numbers the screen
   * does. Not a second implementation that agrees, the same call.
   */
  async function agrees(query: AskQuery, url: string): Promise<void> {
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(200);
    expect(await run(prisma, query)).toEqual(response.json());
  }

  it('answers bands with no filter as the endpoint does', async () => {
    await agrees({ report: 'bands' }, '/analytics/bands');
  });

  it('answers bands filtered by country as the endpoint does', async () => {
    await agrees({ report: 'bands', country: 'GB' }, '/analytics/bands?country=GB');
  });

  it('answers bands filtered by level as the endpoint does', async () => {
    await agrees({ report: 'bands', level: 3 }, '/analytics/bands?level=3');
  });

  it('answers bands filtered by both as the endpoint does', async () => {
    await agrees(
      { report: 'bands', country: 'GB', level: 3 },
      '/analytics/bands?country=GB&level=3',
    );
  });

  for (const report of SLICED) {
    for (const groupBy of SLICE_GROUPS) {
      it(`answers ${report} by ${groupBy} as the endpoint does`, async () => {
        await agrees({ report, groupBy }, `/analytics/${report}?groupBy=${groupBy}`);
      });
    }
  }

  it('answers outliers as the endpoint does', async () => {
    await agrees({ report: 'outliers' }, '/analytics/outliers');
  });

  it('reaches a different report for each member of the union', async () => {
    const reports = new Set<string>();
    for (const groupBy of ['country'] as const satisfies readonly SliceGroup[]) {
      for (const report of SLICED) {
        reports.add(JSON.stringify(await run(prisma, { report, groupBy })));
      }
    }
    // Three arms, three bodies. Two arms wired to the same function would collapse this.
    expect(reports.size).toBe(SLICED.length);
  });

  it('has no arm for a report the union does not carry', () => {
    // Checked by `pnpm typecheck`, not at runtime: vitest strips types without reading them,
    // so the assertion is the `@ts-expect-error`, which fails the build the day the call
    // starts compiling. The body is a closure precisely so nothing runs.
    // @ts-expect-error `headcount` is not a member of `askQuery`.
    const asked = (): unknown => run(prisma, { report: 'headcount' });
    expect(asked).toBeTypeOf('function');
  });
});
