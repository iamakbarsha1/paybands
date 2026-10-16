import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { EMPLOYEE_COUNT } from './reference';
import { SEED_TABLES, writeSeed } from './write';

if (existsSync('.env')) process.loadEnvFile('.env');

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  throw new Error('DATABASE_URL is not set. Copy .env.example to apps/api/.env first.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

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
  const counts = await writeSeed(prisma);

  for (const table of SEED_TABLES) {
    console.log(`${table.padEnd(14)} ${counts[table]}`);
  }
  console.log(`seeded in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
