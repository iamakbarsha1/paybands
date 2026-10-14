import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyTypeProvider,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify';
import { z, type ZodError, type ZodType } from 'zod';
import { CURRENCY_CODES, GENDERS, SALARY_REASONS } from '@paybands/core';
import type { PrismaClient } from '../generated/prisma/client';
import { registerAnalyticsRoutes } from './routes/analytics';
import { registerEmployeeRoutes } from './routes/employees';

/**
 * Routes declare zod schemas and Fastify reads them through the two compilers
 * set below. Decision 43 carries why that is fifteen lines here rather than a
 * dependency that requires an OpenAPI toolchain.
 */
export interface ZodTypeProvider extends FastifyTypeProvider {
  validator: this['schema'] extends ZodType ? z.output<this['schema']> : unknown;
  serializer: this['schema'] extends ZodType ? z.output<this['schema']> : unknown;
}

export type App = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export interface BuildAppOptions {
  logger?: boolean;
  /**
   * Reaches the repositories and nothing else (decision 47). Required rather than optional,
   * so there is no build of this app that is missing half its routes.
   */
  prisma: PrismaClient;
}

/** Strict, so `?departmant=2` is a 400 rather than a filter that quietly did nothing. */
const noQuery = z.strictObject({});

const healthResponse = z.strictObject({ status: z.literal('ok') });

const referenceResponse = z.strictObject({
  currencies: z.array(z.string()).readonly(),
  genders: z.array(z.string()).readonly(),
  salaryReasons: z.array(z.string()).readonly(),
});

/** Builds the instance without starting it, so tests drive it through `inject()` and never bind a port. */
export function buildApp(options: BuildAppOptions): App {
  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(({ schema }) => (data) => {
    const result = (schema as ZodType).safeParse(data);
    return result.success ? { value: result.data } : { error: readable(result.error) };
  });

  // Parsing on the way out means a handler cannot return a shape the schema denies.
  app.setSerializerCompiler(
    ({ schema }) =>
      (data) =>
        JSON.stringify((schema as ZodType).parse(data)),
  );

  // Stays unauthenticated when auth lands, and takes no query schema, so a platform
  // health check can append whatever it likes without earning a 400.
  app.get('/health', { schema: { response: { 200: healthResponse } } }, () => ({
    status: 'ok' as const,
  }));

  // Served from core so the API and the UI cannot drift on what a valid gender or reason is.
  app.get(
    '/reference',
    { schema: { querystring: noQuery, response: { 200: referenceResponse } } },
    () => ({
      currencies: CURRENCY_CODES,
      genders: GENDERS,
      salaryReasons: SALARY_REASONS,
    }),
  );

  registerEmployeeRoutes(app, options.prisma);
  registerAnalyticsRoutes(app, options.prisma);

  return app;
}

/** Fastify puts this message in the 400 body, so it has to name the field. */
function readable(error: ZodError): Error {
  return new Error(
    error.issues
      .map((issue) => {
        const where = issue.path.join('.');
        return where === '' ? issue.message : `${where}: ${issue.message}`;
      })
      .join('; '),
  );
}
