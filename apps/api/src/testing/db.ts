import { hash } from '@node-rs/argon2';
import type { Role } from '@paybands/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { sign } from '@fastify/cookie';
import type { InjectOptions } from 'fastify';
import { buildApp, type App } from '../app';
import type { Complete } from '../ask/translate';
import { ARGON2ID } from '../auth/password';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../auth/session';
import { FIXTURE, FIXTURE_PASSWORD } from './fixture';

/**
 * The test database is whatever `TEST_DATABASE_URL` points at — a container locally
 * (`docker compose up -d`) and a service container in CI (decision 44). Nothing here
 * reads `DATABASE_URL`, so a test run cannot reach the development database by default.
 */

const TABLES = [
  'currency',
  'country',
  'fx_rate',
  'department',
  'job_level',
  'pay_band',
  'employee',
  'salary_record',
  'salary_audit',
  'app_user',
] as const;

/** Fixed, so the one user row is byte-identical on every reload. */
const SALT = Buffer.from('paybands-test-01');

export function hasTestDatabase(): boolean {
  const url = process.env.TEST_DATABASE_URL;
  return url !== undefined && url !== '';
}

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'TEST_DATABASE_URL is not set. Run `docker compose up -d` and export the URL it prints in README.md.',
    );
  }
  assertDisposable(url);
  return url;
}

/**
 * `resetAndSeed` truncates every table it knows about, so it has to be pointed at a database
 * built to be thrown away. The seed makes the same refusal from the other side (decision 32).
 */
function assertDisposable(url: string): void {
  if (process.env.PAYBANDS_TEST_FORCE === '1') return;

  const database = new URL(url).pathname.replace(/^\//, '');
  if (database.endsWith('_test')) return;

  throw new Error(
    `Refusing to truncate "${database}": the test database name has to end in _test. ` +
      'Set PAYBANDS_TEST_FORCE=1 to override.',
  );
}

/** Fixed, so a test can forge a cookie the app will accept and then prove it rejects it. */
export const TEST_SESSION_SECRET = 'paybands-test-session-secret-0123456789';

/**
 * A live session for one of the fixture's users, as the `Cookie` header a browser would
 * send. Defaults to the admin, because that is the account most tests are not about.
 */
export function sessionCookie(role: Role = 'admin'): string {
  const user = FIXTURE.appUsers.find((candidate) => candidate.role === role);
  if (user === undefined) throw new Error(`the fixture has no ${role}`);

  const value = `${user.id}.${role}.${Date.now() + SESSION_TTL_MS}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(sign(value, TEST_SESSION_SECRET))}`;
}

/**
 * One place that knows what a test app is built with, rather than twelve call sites.
 *
 * Signed in by default: every route is behind the guard (`PB-051`), and a test of the band
 * report should be reading bands rather than logging in first. The cookie is forged with the
 * test secret and attached to every `inject` that does not set one of its own, so a test can
 * still send a cookie of its own and have it win. Pass `{ signedIn: false }` for the tests
 * whose subject is the guard.
 *
 * `complete` defaults to null, which is a server with no key and the ask bar off. A test
 * that wants the feature on passes a fake, and no test ever reaches a real model.
 */
export function testApp(
  prisma: PrismaClient,
  options: {
    signedIn?: boolean;
    as?: Role;
    complete?: Complete | null;
    trustProxy?: boolean | string | string[];
    crossSiteCookie?: boolean;
  } = {},
): App {
  const app = buildApp({
    prisma,
    sessionSecret: TEST_SESSION_SECRET,
    complete: options.complete ?? null,
    trustProxy: options.trustProxy ?? false,
    crossSiteCookie: options.crossSiteCookie ?? false,
  });
  if (options.signedIn === false) return app;

  const cookie = sessionCookie(options.as ?? 'admin');

  // Fastify's `inject` is overloaded past what a wrapper can restate, so the casts say
  // "same function, one header added" rather than reimplementing every signature.
  const inject = app.inject.bind(app) as (options: InjectOptions) => unknown;
  app.inject = ((options_: InjectOptions) =>
    inject({ ...options_, headers: { cookie, ...options_.headers } })) as typeof app.inject;

  return app;
}

export function testPrisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl() }) });
}

export async function resetAndSeed(prisma: PrismaClient): Promise<void> {
  const passwordHash = await hash(FIXTURE_PASSWORD, { ...ARGON2ID, salt: SALT });

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );

  await prisma.currency.createMany({ data: [...FIXTURE.currencies] });
  await prisma.country.createMany({ data: [...FIXTURE.countries] });
  await prisma.fxRate.createMany({ data: [...FIXTURE.fxRates] });
  await prisma.department.createMany({ data: [...FIXTURE.departments] });
  await prisma.jobLevel.createMany({ data: [...FIXTURE.jobLevels] });
  await prisma.payBand.createMany({ data: [...FIXTURE.payBands] });
  await prisma.employee.createMany({ data: [...FIXTURE.employees] });
  await prisma.salaryRecord.createMany({ data: [...FIXTURE.salaryRecords] });
  await prisma.appUser.createMany({
    data: FIXTURE.appUsers.map((user) => ({ ...user, passwordHash })),
  });

  // Rows carry explicit ids, which leaves every sequence at 1. A POST that inserts without
  // one would collide with the fixture until the sequence is moved past it.
  for (const table of TABLES) {
    if (table === 'currency' || table === 'country') continue;
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM "${table}"))`,
    );
  }
}

/**
 * For tests of routes that never query. A `buildApp` without a client would mean a build of
 * the app missing half its routes, so the client is required and this one throws the moment
 * anything reaches for it.
 */
export function unusedPrisma(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      throw new Error(
        `this app was built without a database, but something read prisma.${String(property)}`,
      );
    },
  });
}
