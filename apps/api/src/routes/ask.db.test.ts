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

/** Only the two fields the leak test reads, off the four lists the outliers report returns. */
type OutliersResult = Record<
  'belowBand' | 'aboveBand' | 'compRatioOutOfRange' | 'noBand',
  readonly { lastName: string; salary: { amountMinor: string } }[]
>;

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

  /**
   * "The model never produces displayed text" (`docs/design-notes.md` §7). Prose around the
   * object is a 422 and `routes/ask.test.ts` holds that half, because `translate` parses the
   * whole answer. What is left is the 200, where the only text of the model's that could
   * reach a reader is the answer's own formatting.
   */
  it('answers with the query and the report alone, and none of the text they were read from', async () => {
    // Valid JSON, and spaced the way `JSON.stringify` never spaces it, so the body carrying
    // the parsed object rather than the text it was read from is visible rather than assumed.
    const raw = '{\n  "report" : "outliers"\n}\n';
    const query: AskQuery = { report: 'outliers' };

    const app = testApp(prisma, { complete: answering(raw) });
    let response;
    try {
      response = await app.inject({
        method: 'POST',
        url: '/ask',
        payload: { question: 'who is paid outside their band?' },
      });
    } finally {
      await app.close();
    }

    expect(response.statusCode).toBe(200);
    // Equality on the whole body rather than on its two fields in turn: a third key carrying
    // the model's words passes a check of `query` and then `result`, and fails this.
    expect(response.json()).toEqual({ query, result: await run(prisma, query) });
  });

  /**
   * Decision 55 names this as the place its guarantee could stop being true: the lint rule
   * guards `translate.ts`, which holds no client, and this handler holds one because `run`
   * needs it. So the prompt is read back out of the route rather than out of `translate`,
   * and checked against the rows the very same request went on to return.
   */
  it('sends the question as typed and no row the report then returned', async () => {
    const question = 'who is paid outside their band?';
    const prompts: string[] = [];
    const app = testApp(prisma, {
      complete: (prompt) => {
        prompts.push(prompt);
        return Promise.resolve('{"report":"outliers"}');
      },
    });

    let body: { result: OutliersResult };
    try {
      const response = await app.inject({ method: 'POST', url: '/ask', payload: { question } });
      expect(response.statusCode).toBe(200);
      body = response.json();
    } finally {
      await app.close();
    }

    // One call, and the question inside it word for word. A prefix, a suffix or a second
    // turn carrying context all fail one of these two.
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(question);

    const rows = [
      ...body.result.belowBand,
      ...body.result.aboveBand,
      ...body.result.compRatioOutOfRange,
      ...body.result.noBand,
    ];
    // Without this the loop below asserts nothing, which is the shape of a test that cannot fail.
    expect(rows.length).toBeGreaterThan(0);

    // Separators stripped first, so "£70,123.45" is not a way past the figure check.
    const digits = (prompts[0] ?? '').replace(/\D/gu, '');
    for (const row of rows) {
      expect(prompts[0]).not.toContain(row.lastName);
      expect(digits).not.toContain(row.salary.amountMinor);
    }
  });
});
