import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { hasTestDatabase, resetAndSeed, testPrisma } from '../testing/db';
import { writeSeed } from './write';

/**
 * `generate.test.ts` proves the rows are the same twice. This proves the database is
 * (`PB-D01`), which decision 24 had as an argument rather than an assertion: the writer
 * truncates, inserts explicit ids in a fixed order and moves each sequence past them, so its
 * output *should* be a function of the generator's. Here it runs twice and the two databases
 * are compared.
 *
 * Two full seeds is about thirty seconds, which is most of this suite. It buys the one claim
 * the README makes that nothing else checks: running the seed twice gives the same database.
 */

/** The four tables the seed fills with generated rows; the other five are reference data. */
const TABLES = ['employee', 'salary_record', 'pay_band', 'app_user'] as const;

interface Snapshot {
  readonly digests: Record<string, string>;
  readonly sequences: Record<string, string>;
}

/**
 * `row::text` renders the whole row, so a column added to the schema is covered without this
 * file naming it, and `ORDER BY id` makes the digest independent of the order rows come back
 * in. The sequence matters as much as the rows: a seed that leaves it elsewhere hands the
 * next insert a different id.
 */
async function snapshot(prisma: PrismaClient): Promise<Snapshot> {
  const digests: Record<string, string> = {};
  const sequences: Record<string, string> = {};

  for (const table of TABLES) {
    const [row] = await prisma.$queryRawUnsafe<{ digest: string | null }[]>(
      `SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) AS digest FROM "${table}" t`,
    );
    digests[table] = row?.digest ?? 'empty';

    // `pg_get_serial_sequence` returns a schema-qualified name, which is what the regclass
    // cast wants; matching it against `pg_sequences.sequencename` instead finds nothing,
    // because that column holds the bare name.
    const [sequence] = await prisma.$queryRawUnsafe<{ last_value: bigint | null }[]>(
      `SELECT pg_sequence_last_value(pg_get_serial_sequence('${table}', 'id')::regclass) AS last_value`,
    );
    sequences[table] = String(sequence?.last_value ?? 'none');
  }

  return { digests, sequences };
}

describe.skipIf(!hasTestDatabase())('seeding the same database twice', () => {
  let prisma: PrismaClient;
  let first: Snapshot;
  let second: Snapshot;

  beforeAll(async () => {
    prisma = testPrisma();

    await writeSeed(prisma);
    first = await snapshot(prisma);

    await writeSeed(prisma);
    second = await snapshot(prisma);
  }, 180_000);

  afterAll(async () => {
    // The next file in this project expects the fixture, not ten thousand employees.
    await resetAndSeed(prisma);
    await prisma.$disconnect();
  }, 60_000);

  it('writes byte-identical rows the second time', () => {
    expect(second.digests).toEqual(first.digests);
  });

  it('leaves every sequence where the first run left it', () => {
    expect(second.sequences).toEqual(first.sequences);
  });

  it('wrote rows at all, so the digests are not two empty tables agreeing', () => {
    expect(first.digests['employee']).toMatch(/^[0-9a-f]{32}$/);
    expect(first.sequences['employee']).toBe('10000');
  });
});
