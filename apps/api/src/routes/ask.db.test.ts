import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { AskQuery } from '../ask/query';
import { run } from '../ask/run';
import type { Complete } from '../ask/translate';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from '../testing/db';

/** A model that answers with the same thing whatever it is shown. */
const answering =
  (raw: string | null): Complete =>
  () =>
    Promise.resolve(raw);

describe.skipIf(!hasTestDatabase())('POST /ask with a model that answers', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * The route end to end: the translated query comes back beside the numbers, and the numbers
   * are the ones `run` gives for that same query. The query matters on its own — the screen
   * has to show what the question was understood to mean.
   */
  async function asked(
    answer: string,
    question: string,
  ): Promise<{ query: unknown; result: unknown }> {
    const app = testApp(prisma, { complete: answering(answer) });
    try {
      const response = await app.inject({ method: 'POST', url: '/ask', payload: { question } });
      expect(response.statusCode).toBe(200);
      return response.json();
    } finally {
      await app.close();
    }
  }

  it('answers a question about outliers with the query and the report together', async () => {
    const query: AskQuery = { report: 'outliers' };

    const body = await asked('{"report":"outliers"}', 'who is paid outside their band?');

    expect(body.query).toEqual(query);
    expect(body.result).toEqual(await run(prisma, query));
  });

  it('carries the parameters the query was accepted with, and runs with them', async () => {
    const query: AskQuery = { report: 'bands', country: 'GB' };

    const body = await asked(
      '{"report":"bands","country":"GB"}',
      'what do the bands pay in Britain?',
    );

    expect(body.query).toEqual(query);
    expect(body.result).toEqual(await run(prisma, query));
    // Filtered, not the whole table: a dropped parameter would make the two sides agree on
    // a report that answers a different question.
    expect(await run(prisma, query)).not.toEqual(await run(prisma, { report: 'bands' }));
  });
});
