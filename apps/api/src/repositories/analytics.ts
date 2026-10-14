import { isCurrencyCode, type FxRate } from '@paybands/core';
import type { PrismaClient } from '../../generated/prisma/client';
import type { MoneyRow } from './employees';

export interface BandOccupancyQuery {
  readonly country?: string | undefined;
  readonly jobLevelId?: number | undefined;
}

export interface BandOccupancyRow {
  readonly jobLevelId: number;
  readonly jobLevelName: string;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly minMinor: bigint;
  readonly midMinor: bigint;
  readonly maxMinor: bigint;
  readonly headcount: number;
}

/**
 * Every band in force, with the people standing in it. The count is grouped in SQL and joined
 * to the bands here, so a band nobody occupies still has a row — an empty band is the finding,
 * not a missing row.
 */
export async function bandOccupancy(
  prisma: PrismaClient,
  query: BandOccupancyQuery,
): Promise<BandOccupancyRow[]> {
  const where = {
    ...(query.country === undefined ? {} : { countryCode: query.country }),
    ...(query.jobLevelId === undefined ? {} : { jobLevelId: query.jobLevelId }),
  };

  const [bands, counts] = await Promise.all([
    prisma.payBand.findMany({
      where: { ...where, effectiveTo: null },
      include: { jobLevel: true },
      orderBy: [{ jobLevelId: 'asc' }, { countryCode: 'asc' }],
    }),
    prisma.employee.groupBy({
      by: ['jobLevelId', 'countryCode'],
      where: { ...where, terminationDate: null },
      _count: { _all: true },
    }),
  ]);

  const headcounts = new Map(
    counts.map((row) => [`${row.jobLevelId}:${row.countryCode}`, row._count._all]),
  );

  return bands.map((band) => ({
    jobLevelId: band.jobLevelId,
    jobLevelName: band.jobLevel.name,
    countryCode: band.countryCode,
    currencyCode: band.currencyCode,
    minMinor: band.minMinor,
    midMinor: band.midMinor,
    maxMinor: band.maxMinor,
    headcount: headcounts.get(`${band.jobLevelId}:${band.countryCode}`) ?? 0,
  }));
}

/** The groupings every sliced report offers. One closed set, so two reports cannot disagree. */
export const SLICE_GROUPS = ['country', 'department', 'level'] as const;
export type SliceGroup = (typeof SLICE_GROUPS)[number];

interface Sliceable {
  readonly countryCode: string;
  readonly departmentId: number;
  readonly jobLevelId: number;
}

function sliceKey(employee: Sliceable, groupBy: SliceGroup): string {
  if (groupBy === 'country') return employee.countryCode;
  if (groupBy === 'department') return String(employee.departmentId);
  return String(employee.jobLevelId);
}

export interface DistributionSlice {
  readonly key: string;
  readonly name: string;
  /** Everyone still here in the slice, including anyone whose pay is not on record. */
  readonly headcount: number;
  /** The open salary record of each of them that has one, in their own currency. */
  readonly salaries: readonly MoneyRow[];
}

/**
 * The grouping is a closed set because each member is a column the slice is keyed on, and
 * a grouping the database cannot index is a report nobody waits for.
 *
 * The rows come back whole rather than aggregated: the percentiles are exact integer
 * arithmetic over converted amounts, which is `packages/core`'s job and not SQL's
 * (decision 48). What SQL does here is the grouping, the filtering and the join.
 */
export async function salaryDistribution(
  prisma: PrismaClient,
  groupBy: SliceGroup,
): Promise<DistributionSlice[]> {
  const [groups, employees] = await Promise.all([
    groupRows(prisma, groupBy),
    prisma.employee.findMany({
      where: { terminationDate: null },
      select: {
        countryCode: true,
        departmentId: true,
        jobLevelId: true,
        salaryRecords: {
          where: { effectiveTo: null },
          select: { amountMinor: true, currencyCode: true },
        },
      },
    }),
  ]);

  const headcounts = new Map<string, number>();
  const salaries = new Map<string, MoneyRow[]>();

  for (const employee of employees) {
    const key = sliceKey(employee, groupBy);
    headcounts.set(key, (headcounts.get(key) ?? 0) + 1);

    const open = employee.salaryRecords[0];
    if (open === undefined) continue;
    const held = salaries.get(key) ?? [];
    held.push({ amountMinor: open.amountMinor, currencyCode: open.currencyCode });
    salaries.set(key, held);
  }

  return groups.map((group) => ({
    key: group.key,
    name: group.name,
    headcount: headcounts.get(group.key) ?? 0,
    salaries: salaries.get(group.key) ?? [],
  }));
}

/** Every group the reference data knows about, so an empty one is reported rather than missing. */
async function groupRows(
  prisma: PrismaClient,
  groupBy: SliceGroup,
): Promise<{ key: string; name: string }[]> {
  if (groupBy === 'country') {
    const rows = await prisma.country.findMany({ orderBy: { code: 'asc' } });
    return rows.map((row) => ({ key: row.code, name: row.name }));
  }
  if (groupBy === 'department') {
    const rows = await prisma.department.findMany({ orderBy: { id: 'asc' } });
    return rows.map((row) => ({ key: String(row.id), name: row.name }));
  }
  const rows = await prisma.jobLevel.findMany({ orderBy: { rank: 'asc' } });
  return rows.map((row) => ({ key: String(row.id), name: row.name }));
}

/**
 * The whole rate table, which is small and effective-dated: `toUsd` picks the row covering
 * the date it is given, so filtering here would only hide the rate it needs.
 */
export async function fxRates(prisma: PrismaClient): Promise<FxRate[]> {
  const rows = await prisma.fxRate.findMany();
  return rows.flatMap((row) =>
    isCurrencyCode(row.currencyCode)
      ? [
          {
            currency: row.currencyCode,
            rateToUsdMicros: row.rateToUsdMicros,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo,
          },
        ]
      : [],
  );
}
