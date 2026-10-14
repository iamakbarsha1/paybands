import { compRatio, money, percentiles, toUsd, type FxRate } from '@paybands/core';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import {
  bandOccupancy,
  compRatioSlices,
  fxRates,
  salaryDistribution,
  SLICE_GROUPS,
  type CompRatioSlice,
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

const sliceQuery = z.strictObject({ groupBy: z.enum(SLICE_GROUPS) });

const distributionResponse = z.strictObject({
  groupBy: z.enum(SLICE_GROUPS),
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

/**
 * Twenty per cent either side of the midpoint, which is where a band's own min and max
 * usually sit, then a bucket past each end for the people outside it. Stated in the
 * response because a histogram whose boundaries are not on the page is unreadable.
 */
const BUCKETS = [
  { from: null, to: 0.8 },
  { from: 0.8, to: 0.9 },
  { from: 0.9, to: 1.0 },
  { from: 1.0, to: 1.1 },
  { from: 1.1, to: 1.2 },
  { from: 1.2, to: null },
] as const;

const summarySchema = z.strictObject({
  headcount: z.number(),
  measured: z.number(),
  unbanded: z.number(),
  counts: z.array(z.number()),
});

const compRatioResponse = z.strictObject({
  groupBy: z.enum(SLICE_GROUPS),
  buckets: z.array(z.strictObject({ from: z.number().nullable(), to: z.number().nullable() })),
  overall: summarySchema,
  groups: z.array(summarySchema.extend({ key: z.string(), name: z.string() })),
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
    { schema: { querystring: sliceQuery, response: { 200: distributionResponse } } },
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

  app.get(
    '/analytics/comp-ratio',
    { schema: { querystring: sliceQuery, response: { 200: compRatioResponse } } },
    async (request) => {
      const slices = await compRatioSlices(prisma, request.query.groupBy);

      return {
        groupBy: request.query.groupBy,
        buckets: BUCKETS.map((bucket) => ({ from: bucket.from, to: bucket.to })),
        // The org is every slice put together, counted once rather than summed from the
        // groups, so the overall figure cannot drift from the detail that makes it up.
        overall: summarise({
          headcount: slices.reduce((sum, slice) => sum + slice.headcount, 0),
          people: slices.flatMap((slice) => [...slice.people]),
        }),
        groups: slices.map((slice) => ({
          key: slice.key,
          name: slice.name,
          ...summarise(slice),
        })),
      };
    },
  );
}

/**
 * A slice counted into the buckets. `unbanded` is the people there is nothing to measure
 * against — the band table does not cover their level and country — which the report shows
 * rather than quietly leaving out of the denominator.
 */
function summarise(slice: Pick<CompRatioSlice, 'headcount' | 'people'>): {
  headcount: number;
  measured: number;
  unbanded: number;
  counts: number[];
} {
  const counts: number[] = BUCKETS.map(() => 0);
  let measured = 0;
  let unbanded = 0;

  for (const person of slice.people) {
    if (person.band === null) {
      unbanded += 1;
      continue;
    }
    // Nothing on record is not the same as nothing to measure against, so it counts as neither.
    if (person.salary === null) continue;

    const ratio = compRatio(money(person.salary.amountMinor, person.salary.currencyCode), {
      min: money(person.band.min.amountMinor, person.band.min.currencyCode),
      mid: money(person.band.mid.amountMinor, person.band.mid.currencyCode),
      max: money(person.band.max.amountMinor, person.band.max.currencyCode),
    });
    if (ratio === null) {
      unbanded += 1;
      continue;
    }

    const index = BUCKETS.findIndex((bucket) => bucket.to === null || ratio < bucket.to);
    counts[index] = (counts[index] ?? 0) + 1;
    measured += 1;
  }

  return { headcount: slice.headcount, measured, unbanded, counts };
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
