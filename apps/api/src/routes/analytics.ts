import { money, percentiles, toUsd, type FxRate } from '@paybands/core';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import {
  bandOccupancy,
  DISTRIBUTION_GROUPS,
  fxRates,
  salaryDistribution,
  type DistributionSlice,
} from '../repositories/analytics';

const bandsQuery = z.strictObject({
  country: z.string().length(2).optional(),
  level: z.coerce.number().int().positive().optional(),
});

const bandsResponse = z.strictObject({
  bands: z.array(
    z.strictObject({
      jobLevelId: z.number(),
      jobLevelName: z.string(),
      countryCode: z.string(),
      currencyCode: z.string(),
      minMinor: z.string(),
      midMinor: z.string(),
      maxMinor: z.string(),
      headcount: z.number(),
    }),
  ),
});

/** The four points the distribution report answers in, fixed rather than asked for. */
const POINTS = [25, 50, 75, 90] as const;

const distributionQuery = z.strictObject({ groupBy: z.enum(DISTRIBUTION_GROUPS) });

const distributionResponse = z.strictObject({
  groupBy: z.enum(DISTRIBUTION_GROUPS),
  currency: z.literal('USD'),
  groups: z.array(
    z.strictObject({
      key: z.string(),
      name: z.string(),
      headcount: z.number(),
      percentiles: z
        .strictObject({ p25: z.string(), p50: z.string(), p75: z.string(), p90: z.string() })
        .nullable(),
    }),
  ),
});

export function registerAnalyticsRoutes(app: App, prisma: PrismaClient): void {
  app.get(
    '/analytics/bands',
    { schema: { querystring: bandsQuery, response: { 200: bandsResponse } } },
    async (request) => {
      const bands = await bandOccupancy(prisma, {
        country: request.query.country,
        jobLevelId: request.query.level,
      });

      return {
        bands: bands.map((band) => ({
          ...band,
          minMinor: band.minMinor.toString(),
          midMinor: band.midMinor.toString(),
          maxMinor: band.maxMinor.toString(),
        })),
      };
    },
  );

  app.get(
    '/analytics/distribution',
    { schema: { querystring: distributionQuery, response: { 200: distributionResponse } } },
    async (request) => {
      const [slices, rates] = await Promise.all([
        salaryDistribution(prisma, request.query.groupBy),
        fxRates(prisma),
      ]);
      // One date for the whole report, so two slices are never converted at different rates.
      const onDate = new Date();

      return {
        groupBy: request.query.groupBy,
        currency: 'USD' as const,
        groups: slices.map((slice) => ({
          key: slice.key,
          name: slice.name,
          headcount: slice.headcount,
          percentiles: pointsFor(slice, rates, onDate),
        })),
      };
    },
  );
}

/**
 * Normalised USD, which the glossary allows for cross-country salary comparison and nowhere
 * else. Null is a slice with no pay on record — an empty group the report renders rather
 * than a zero it invents (decision 39).
 */
function pointsFor(
  slice: DistributionSlice,
  rates: readonly FxRate[],
  onDate: Date,
): { p25: string; p50: string; p75: string; p90: string } | null {
  const usd = slice.salaries.map((row) =>
    toUsd(money(row.amountMinor, row.currencyCode), rates, onDate),
  );
  const points = percentiles(usd, POINTS);
  if (points === null) return null;

  const [p25, p50, p75, p90] = points;
  if (p25 === undefined || p50 === undefined || p75 === undefined || p90 === undefined) {
    throw new RangeError(`percentiles returned ${points.length} points for ${POINTS.length} asked`);
  }
  return {
    p25: p25.value.amount.toString(),
    p50: p50.value.amount.toString(),
    p75: p75.value.amount.toString(),
    p90: p90.value.amount.toString(),
  };
}
