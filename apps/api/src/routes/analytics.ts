import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { bandOccupancy } from '../repositories/analytics';

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
}
