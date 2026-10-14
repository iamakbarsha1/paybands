import {
  compRatio,
  DEFAULT_COMP_RATIO_THRESHOLD,
  money,
  outliers,
  payGap,
  percentiles,
  toUsd,
  type FxRate,
  type Outlier,
  type PayBand,
} from '@paybands/core';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import {
  bandedSalaries,
  bandOccupancy,
  compRatioSlices,
  fxRates,
  genderedSalaries,
  salaryDistribution,
  SLICE_GROUPS,
  type BandRow,
  type CompRatioSlice,
  type DistributionSlice,
  type GenderedSlice,
  type OutlierCandidate,
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

const outlierRow = z.strictObject({
  employeeId: z.number(),
  employeeCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  countryCode: z.string(),
  departmentName: z.string(),
  jobLevelName: z.string(),
  salary: z.strictObject({ amountMinor: z.string(), currencyCode: z.string() }),
  compRatio: z.number().nullable(),
});

const outliersResponse = z.strictObject({
  threshold: z.strictObject({ min: z.number(), max: z.number() }),
  belowBand: z.array(outlierRow),
  aboveBand: z.array(outlierRow),
  compRatioOutOfRange: z.array(outlierRow),
  noBand: z.array(outlierRow),
});

/** Strict and empty: the report takes no parameters, so a parameter is a mistake worth a 400. */
const noQuery = z.strictObject({});

/**
 * Policy, and the same floor the seed plants Legal under. A gap over three people is noise
 * with a decimal point on it (`docs/glossary.md`), so the figure is withheld rather than
 * published small. It travels in the response because a refusal has to be readable.
 */
const MIN_GROUP_SIZE = 5;

const gapSchema = z.strictObject({
  headcount: z.number(),
  compared: z.strictObject({ male: z.number(), female: z.number() }),
  excluded: z.number(),
  suppressed: z.boolean(),
  reason: z.string().nullable(),
  meanGap: z.number().nullable(),
  medianGap: z.number().nullable(),
});

const payGapResponse = z.strictObject({
  groupBy: z.enum(SLICE_GROUPS),
  currency: z.literal('USD'),
  minGroupSize: z.number(),
  overall: gapSchema,
  groups: z.array(gapSchema.extend({ key: z.string(), name: z.string() })),
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

  app.get(
    '/analytics/outliers',
    { schema: { querystring: noQuery, response: { 200: outliersResponse } } },
    async () => {
      const candidates = await bandedSalaries(prisma);
      const found = outliers(
        candidates.map((row) => ({
          employeeId: row.employeeId,
          salary: money(row.salary.amountMinor, row.salary.currencyCode),
          band: row.band === null ? undefined : asPayBand(row.band),
        })),
        DEFAULT_COMP_RATIO_THRESHOLD,
      );

      const byId = new Map(candidates.map((row) => [row.employeeId, row]));

      return {
        // Policy, not a fact about the band, so the report carries the line it judged against.
        threshold: DEFAULT_COMP_RATIO_THRESHOLD,
        belowBand: listed(found.belowBand, byId),
        aboveBand: listed(found.aboveBand, byId),
        compRatioOutOfRange: listed(found.compRatioOutOfRange, byId),
        noBand: listed(found.noBand, byId),
      };
    },
  );

  app.get(
    '/analytics/pay-gap',
    { schema: { querystring: sliceQuery, response: { 200: payGapResponse } } },
    async (request) => {
      const [slices, rates] = await Promise.all([
        genderedSalaries(prisma, request.query.groupBy),
        fxRates(prisma),
      ]);
      const onDate = new Date();

      // A slice can span countries, and `payGap` refuses a mixed-currency one, so the
      // conversion is the caller's to make. The gap is a ratio, so USD is a common scale
      // rather than a claim about anyone's pay.
      const gapOf = (people: GenderedSlice['people']) =>
        payGap(
          people.map((person) => ({
            gender: person.gender,
            salary: toUsd(
              money(person.salary.amountMinor, person.salary.currencyCode),
              rates,
              onDate,
            ),
          })),
          { minGroupSize: MIN_GROUP_SIZE },
        );

      return {
        groupBy: request.query.groupBy,
        currency: 'USD' as const,
        minGroupSize: MIN_GROUP_SIZE,
        overall: gapOf(slices.flatMap((slice) => [...slice.people])),
        groups: slices.map((slice) => ({
          key: slice.key,
          name: slice.name,
          ...gapOf(slice.people),
        })),
      };
    },
  );
}

function asPayBand(band: BandRow): PayBand {
  return {
    min: money(band.min.amountMinor, band.min.currencyCode),
    mid: money(band.mid.amountMinor, band.mid.currencyCode),
    max: money(band.max.amountMinor, band.max.currencyCode),
  };
}

/** The person behind each finding, put back on it: a list of ids is not something to act on. */
function listed(
  found: readonly Outlier[],
  byId: ReadonlyMap<number, OutlierCandidate>,
): {
  employeeId: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  departmentName: string;
  jobLevelName: string;
  salary: { amountMinor: string; currencyCode: string };
  compRatio: number | null;
}[] {
  return found.flatMap((outlier) => {
    const row = byId.get(outlier.employeeId);
    if (row === undefined) return [];

    return [
      {
        employeeId: row.employeeId,
        employeeCode: row.employeeCode,
        firstName: row.firstName,
        lastName: row.lastName,
        countryCode: row.countryCode,
        departmentName: row.departmentName,
        jobLevelName: row.jobLevelName,
        salary: {
          amountMinor: row.salary.amountMinor.toString(),
          currencyCode: row.salary.currencyCode,
        },
        compRatio: outlier.compRatio,
      },
    ];
  });
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

    const ratio = compRatio(
      money(person.salary.amountMinor, person.salary.currencyCode),
      asPayBand(person.band),
    );
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
