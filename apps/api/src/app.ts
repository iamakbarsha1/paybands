import Fastify, { type FastifyInstance } from 'fastify';
import { CURRENCY_CODES, GENDERS, SALARY_REASONS } from '@paybands/core';

export interface BuildAppOptions {
  logger?: boolean;
}

/** Builds the instance without starting it, so tests drive it through `inject()` and never bind a port. */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  // Stays unauthenticated when auth lands, so a platform health check needs no credentials.
  app.get('/health', () => ({ status: 'ok' as const }));

  // Served from core so the API and the UI cannot drift on what a valid gender or reason is.
  app.get('/reference', () => ({
    currencies: CURRENCY_CODES,
    genders: GENDERS,
    salaryReasons: SALARY_REASONS,
  }));

  return app;
}
