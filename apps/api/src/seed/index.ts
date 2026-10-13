import { existsSync } from 'node:fs';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { SEED, generate } from './generate';
import { EMPLOYEE_COUNT } from './reference';

if (existsSync('.env')) process.loadEnvFile('.env');

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  throw new Error('DATABASE_URL is not set. Copy .env.example to apps/api/.env first.');
}

const CHUNK_SIZE = 2000;

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

/** The demo login. The password ships in the README, so it is a constant here rather than a secret. */
const HR_PASSWORD = 'paybands-demo-2026';
/** Fixed so `app_user` is byte-identical on every reseed. Phase 7 hashes real passwords with a random salt. */
const HR_SALT = Buffer.from('paybands-seed-01');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function insertChunked<T>(
  rows: readonly T[],
  insert: (chunk: T[]) => Promise<{ count: number }>,
): Promise<number> {
  let written = 0;
  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const { count } = await insert(rows.slice(start, start + CHUNK_SIZE));
    written += count;
  }
  return written;
}

async function resetSequence(table: string): Promise<void> {
  const [row] = await prisma.$queryRawUnsafe<{ last_value: bigint | null }[]>(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM "${table}")) AS last_value`,
  );
  if (row?.last_value === undefined || row.last_value === null) {
    throw new Error(`${table}: no sequence to reset`);
  }
}

async function assertSafeToTruncate(): Promise<void> {
  if (process.env.PAYBANDS_SEED_FORCE === '1') return;

  // max(id) on a table that does not exist raises 42P01 instead of returning NULL, so a branch
  // with no migrations applied has to be ruled out before the aggregate is allowed to parse.
  const [probe] = await prisma.$queryRaw<{ employee: string | null }[]>`
    SELECT to_regclass('public.employee')::text AS employee
  `;
  if (probe === undefined || probe.employee === null) return;

  const [row] = await prisma.$queryRaw<{ max_id: number | null }[]>`
    SELECT max(id)::int AS max_id FROM employee
  `;
  const maxId = row?.max_id;
  if (maxId === undefined || maxId === null || maxId === EMPLOYEE_COUNT) return;

  throw new Error(
    `Refusing to truncate: employee has max(id) ${maxId}, this seed writes ${EMPLOYEE_COUNT}. ` +
      'The database holds rows this seed did not write. ' +
      'Set PAYBANDS_SEED_FORCE=1 to truncate it anyway.',
  );
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  await assertSafeToTruncate();
  const data = generate(SEED);
  const passwordHash = await hash(HR_PASSWORD, { salt: HR_SALT });
  const appUsers = data.appUsers.map((user) => ({ ...user, passwordHash }));

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );

  const counts = {
    currency: await insertChunked(data.currencies, (rows) =>
      prisma.currency.createMany({ data: rows }),
    ),
    country: await insertChunked(data.countries, (rows) =>
      prisma.country.createMany({ data: rows }),
    ),
    fx_rate: await insertChunked(data.fxRates, (rows) => prisma.fxRate.createMany({ data: rows })),
    department: await insertChunked(data.departments, (rows) =>
      prisma.department.createMany({ data: rows }),
    ),
    job_level: await insertChunked(data.jobLevels, (rows) =>
      prisma.jobLevel.createMany({ data: rows }),
    ),
    pay_band: await insertChunked(data.payBands, (rows) =>
      prisma.payBand.createMany({ data: rows }),
    ),
    employee: await insertChunked(data.employees, (rows) =>
      prisma.employee.createMany({ data: rows }),
    ),
    salary_record: await insertChunked(data.salaryRecords, (rows) =>
      prisma.salaryRecord.createMany({ data: rows }),
    ),
    app_user: await insertChunked(appUsers, (rows) => prisma.appUser.createMany({ data: rows })),
  };

  for (const table of TABLES) {
    // currency and country are keyed by their ISO code, so they have no sequence to reset.
    if (table !== 'currency' && table !== 'country') {
      await resetSequence(table);
    }
  }

  for (const table of TABLES) {
    console.log(`${table.padEnd(14)} ${counts[table]}`);
  }
  console.log(`seeded in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
