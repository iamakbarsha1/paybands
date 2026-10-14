import type { PrismaClient } from '../../generated/prisma/client';

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
