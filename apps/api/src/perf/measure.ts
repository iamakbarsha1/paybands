import { performance } from 'node:perf_hooks';
import { buildApp } from '../app';
import { createPrismaClient } from '../db';
import {
  bandOccupancy,
  bandedSalaries,
  compRatioSlices,
  genderedSalaries,
  salaryDistribution,
  SLICE_GROUPS,
  type SliceGroup,
} from '../repositories/analytics';
import {
  bandsReport,
  compRatioReport,
  distributionReport,
  outliersReport,
  payGapReport,
} from '../routes/analytics';
import { sessionCookie, TEST_SESSION_SECRET } from '../testing/db';

/**
 * The instrument behind `docs/performance.md`. Every analytics report, timed at three layers
 * against whatever `DATABASE_URL` points at:
 *
 *   fetch  — the repository call alone: the rows crossing the wire
 *   report — fetch plus the `packages/core` arithmetic over those rows
 *   http   — report plus routing, the session guard and response serialisation
 *
 * The three layers exist because decision 48 left one question open: whether fetching whole
 * rows and doing the money arithmetic in TypeScript costs more than the aggregate Postgres
 * would have done. `report - fetch` is that cost, in milliseconds, per report.
 *
 *   DATABASE_URL='postgresql://paybands:paybands@localhost:5433/paybands_perf' \
 *     pnpm exec tsx src/perf/measure.ts
 *
 * `RUNS` sets the sample size (default 15); the first `WARMUP` calls of each layer are
 * discarded, so a JIT that has not seen the code yet is not what gets reported.
 */

const RUNS = Number(process.env.RUNS ?? 15);
const WARMUP = Number(process.env.WARMUP ?? 3);

interface Case {
  readonly name: string;
  readonly path: string;
  readonly fetch: () => Promise<{ rows: number }>;
  readonly report: () => Promise<unknown>;
}

interface Stats {
  readonly min: number;
  readonly p50: number;
  readonly p95: number;
}

function stats(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0;
  return { min: sorted[0] ?? 0, p50: at(0.5), p95: at(0.95) };
}

async function time(run: () => Promise<unknown>): Promise<Stats> {
  for (let i = 0; i < WARMUP; i += 1) await run();

  const samples: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }
  return stats(samples);
}

function ms(value: number): string {
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const app = buildApp({ prisma, sessionSecret: TEST_SESSION_SECRET, complete: null });
  const cookie = sessionCookie();

  const sliced = <T>(
    name: string,
    path: string,
    repository: (groupBy: SliceGroup) => Promise<readonly T[]>,
    rows: (slices: readonly T[]) => number,
    report: (groupBy: SliceGroup) => Promise<unknown>,
  ): Case[] =>
    SLICE_GROUPS.map((groupBy) => ({
      name: `${name} ?groupBy=${groupBy}`,
      path: `${path}?groupBy=${groupBy}`,
      fetch: async () => ({ rows: rows(await repository(groupBy)) }),
      report: () => report(groupBy),
    }));

  const cases: Case[] = [
    {
      name: 'GET /analytics/bands',
      path: '/analytics/bands',
      fetch: async () => ({ rows: (await bandOccupancy(prisma, {})).length }),
      report: () => bandsReport(prisma, {}),
    },
    ...sliced(
      'GET /analytics/distribution',
      '/analytics/distribution',
      (groupBy) => salaryDistribution(prisma, groupBy),
      (slices) => slices.reduce((sum, slice) => sum + slice.salaries.length, 0),
      (groupBy) => distributionReport(prisma, groupBy),
    ),
    ...sliced(
      'GET /analytics/comp-ratio',
      '/analytics/comp-ratio',
      (groupBy) => compRatioSlices(prisma, groupBy),
      (slices) => slices.reduce((sum, slice) => sum + slice.people.length, 0),
      (groupBy) => compRatioReport(prisma, groupBy),
    ),
    ...sliced(
      'GET /analytics/pay-gap',
      '/analytics/pay-gap',
      (groupBy) => genderedSalaries(prisma, groupBy),
      (slices) => slices.reduce((sum, slice) => sum + slice.people.length, 0),
      (groupBy) => payGapReport(prisma, groupBy),
    ),
    {
      name: 'GET /analytics/outliers',
      path: '/analytics/outliers',
      fetch: async () => ({ rows: (await bandedSalaries(prisma)).length }),
      report: () => outliersReport(prisma),
    },
  ];

  console.log(`runs ${RUNS}, warmup ${WARMUP}, node ${process.version}`);
  console.log('');
  console.log(
    '| Endpoint | rows | bytes | fetch p50 | report p50 | http p50 | http min | http p95 |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');

  for (const testCase of cases) {
    const { rows } = await testCase.fetch();
    const response = await app.inject({ method: 'GET', url: testCase.path, headers: { cookie } });
    if (response.statusCode !== 200) {
      throw new Error(
        `${testCase.path} answered ${response.statusCode}: ${response.body.slice(0, 200)}`,
      );
    }

    const fetched = await time(testCase.fetch);
    const reported = await time(testCase.report);
    const served = await time(() =>
      app.inject({ method: 'GET', url: testCase.path, headers: { cookie } }),
    );

    console.log(
      `| \`${testCase.name}\` | ${rows} | ${response.body.length} | ${ms(fetched.p50)} | ${ms(reported.p50)} | ${ms(served.p50)} | ${ms(served.min)} | ${ms(served.p95)} |`,
    );
  }

  await app.close();
  await prisma.$disconnect();
}

await main();
