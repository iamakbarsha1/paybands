import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { ARGON2ID } from '../auth/password';
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
