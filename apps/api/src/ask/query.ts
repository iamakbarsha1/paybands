import { z } from 'zod';
import { SLICE_GROUPS } from '../repositories/analytics';

const groupBy = z.enum(SLICE_GROUPS);

/**
 * One member per analytics endpoint, carrying exactly the parameters that endpoint already
 * takes. `report` is the URL path segment, so a translated query names the route that runs
 * it. Every member is strict: an invented key is a refusal rather than a field quietly
 * dropped on the way to a report that then answers a different question.
 */
export const askQuery = z.discriminatedUnion('report', [
  z.strictObject({
    report: z.literal('bands'),
    country: z.string().length(2).optional(),
    level: z.number().int().positive().optional(),
  }),
  z.strictObject({ report: z.literal('distribution'), groupBy }),
  z.strictObject({ report: z.literal('comp-ratio'), groupBy }),
  z.strictObject({ report: z.literal('pay-gap'), groupBy }),
  z.strictObject({ report: z.literal('outliers') }),
]);

export type AskQuery = z.infer<typeof askQuery>;
