import type { PrismaClient } from '../../generated/prisma/client';
import {
  bandsReport,
  compRatioReport,
  distributionReport,
  outliersReport,
  payGapReport,
} from '../routes/analytics';
import type { AskQuery } from '@paybands/core';

/** Whatever the chosen report answers. One member per arm of the switch below. */
export type AskResult =
  | Awaited<ReturnType<typeof bandsReport>>
  | Awaited<ReturnType<typeof distributionReport>>
  | Awaited<ReturnType<typeof compRatioReport>>
  | Awaited<ReturnType<typeof outliersReport>>
  | Awaited<ReturnType<typeof payGapReport>>;

/**
 * The translated query, run. These are the same five functions `/analytics/...` calls, so a
 * question and a click reach one implementation of the arithmetic rather than two that agree
 * until they do not.
 *
 * A switch rather than a lookup table because `AskQuery` is discriminated on `report`: a
 * report added to the union and not to a `case` leaves this function able to return nothing,
 * and the declared return type refuses that. The compiler is the test for the sixth report.
 */
export async function run(prisma: PrismaClient, query: AskQuery): Promise<AskResult> {
  switch (query.report) {
    case 'bands':
      return bandsReport(prisma, query);
    case 'distribution':
      return distributionReport(prisma, query.groupBy);
    case 'comp-ratio':
      return compRatioReport(prisma, query.groupBy);
    case 'pay-gap':
      return payGapReport(prisma, query.groupBy);
    case 'outliers':
      return outliersReport(prisma);
  }
}
