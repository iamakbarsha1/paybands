import { hash } from '@node-rs/argon2';
import type { PrismaClient } from '../../generated/prisma/client';
import { ARGON2ID } from '../auth/password';
import { SEED, generate } from './generate';

/**
 * The seed's writer, taking the client rather than building one.
 *
 * Split from `index.ts` so the thing whose determinism is claimed can be run twice against a
 * database inside a test (`PB-D01`). The command-line half keeps what belongs to a command
 * line: the environment, the client, the refusal to truncate a database this seed did not
 * write, and the summary it prints.
 */

const CHUNK_SIZE = 2000;

export const SEED_TABLES = [
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

export type SeedTable = (typeof SEED_TABLES)[number];

/** The demo login. The password ships in the README, so it is a constant here rather than a secret. */
export const HR_PASSWORD = 'paybands-demo-2026';
/** Fixed so `app_user` is byte-identical on every reseed. The login path salts at random. */
const HR_SALT = Buffer.from('paybands-seed-01');

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

async function resetSequence(prisma: PrismaClient, table: SeedTable): Promise<void> {
  const [row] = await prisma.$queryRawUnsafe<{ last_value: bigint | null }[]>(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM "${table}")) AS last_value`,
  );
  if (row?.last_value === undefined || row.last_value === null) {
    throw new Error(`${table}: no sequence to reset`);
  }
}

/**
 * Truncates every table this seed owns and writes the generated rows back, in dependency
 * order, with the ids the generator chose. Every sequence then moves past them, so the first
 * `POST /employees` after a seed does not collide with row 10,000.
 *
 * Nothing here reads the environment or the clock: the rows come from `generate(SEED)` and
 * the one hash uses a fixed salt, which is what makes two runs the same database.
 */
export async function writeSeed(prisma: PrismaClient): Promise<Record<SeedTable, number>> {
  const data = generate(SEED);
  // The salt is the seed's, the cost is the login path's, so the demo row is hashed the
  // same way a real one would be.
  const passwordHash = await hash(HR_PASSWORD, { ...ARGON2ID, salt: HR_SALT });
  const appUsers = data.appUsers.map((user) => ({ ...user, passwordHash }));

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${SEED_TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
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

  for (const table of SEED_TABLES) {
    // currency and country are keyed by their ISO code, so they have no sequence to reset.
    if (table !== 'currency' && table !== 'country') {
      await resetSequence(prisma, table);
    }
  }

  return counts;
}
