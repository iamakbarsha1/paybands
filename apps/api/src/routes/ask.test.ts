import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../app';
import { translate, type Complete } from '../ask/translate';
import { ASK_QUESTIONS, ASK_WINDOW_MS } from '../auth/rate-limit';
import { testApp, unusedPrisma } from '../testing/db';

/** A model that answers with the same thing whatever it is shown. */
const answering =
  (raw: string | null): Complete =>
  () =>
    Promise.resolve(raw);

/**
 * Pinned literals rather than imported constants. These two bodies are the whole of what a
 * caller is told when the feature cannot run, so changing either should be a deliberate edit
 * in two places (`tasks/lessons.md`).
 */
const OFF = 'The ask bar is off: this server was started without ANTHROPIC_API_KEY.';
const UNREACHABLE = 'The model could not be reached.';

const apps: App[] = [];

/** Closed after each test, so a registration built for one case cannot be read by the next. */
function appWith(complete: Complete | null): App {
  const app = testApp(unusedPrisma(), { complete });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function ask(app: App, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/ask', payload });
}

describe('POST /ask without a key', () => {
  it('answers 503 rather than reaching for a model it does not have', async () => {
    const response = await ask(appWith(null), { question: 'show me the pay bands' });

    expect(response.statusCode).toBe(503);
  });

  it('names the missing variable and carries nothing else', async () => {
    const response = await ask(appWith(null), { question: 'show me the pay bands' });

    // Equality, not a substring: a fixed body is a body no key value can travel in.
    expect(response.json()).toEqual({ message: OFF });
  });

  it('reports the feature off on /health', async () => {
    const response = await appWith(null).inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({ status: 'ok', ask: false });
  });
});

describe('POST /ask with a model', () => {
  it('reports the feature on at /health', async () => {
    const app = appWith(answering('{"report":"outliers"}'));

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({ status: 'ok', ask: true });
  });

  it('answers 422 when the model writes prose, which is an outcome rather than a fault', async () => {
    const app = appWith(answering('Sure! Here are the pay bands for every country.'));

    const response = await ask(app, { question: 'show me the pay bands' });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ message: 'The model did not answer with JSON.' });
  });

  it('asks once for an answer it refuses, rather than asking again for a better one', async () => {
    let calls = 0;
    const app = appWith(() => {
      calls += 1;
      return Promise.resolve('Sure! Here are the pay bands for every country.');
    });

    const response = await ask(app, { question: 'show me the pay bands' });

    // "Rejected, not retried into submission" (`docs/design-notes.md` §7). The other two call
    // counts in the suite both run an answer that was accepted, so this is the only one that
    // says a refusal ends the exchange.
    expect(response.statusCode).toBe(422);
    expect(calls).toBe(1);
  });

  it('answers 422 when the model asks for a report nobody serves', async () => {
    const app = appWith(answering('{"report":"attrition"}'));

    const response = await ask(app, { question: 'how many people leave' });

    expect(response.statusCode).toBe(422);
    expect(JSON.stringify(response.json())).toContain('not a query these reports take');
  });

  it('answers something readable when the call itself fails', async () => {
    const app = appWith(() => Promise.reject(new Error('getaddrinfo ENOTFOUND api.anthropic.com')));

    const response = await ask(app, { question: 'show me the pay bands' });

    // 503 rather than 500: the request was fine and the model was not. The transport's own
    // message stays out of the body, because nobody can act on a resolver error.
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ message: UNREACHABLE });
  });

  it('hands the question to translate with nothing of its own added', async () => {
    const question = 'how is pay spread across departments?';
    const record =
      (into: string[]): Complete =>
      (prompt) => {
        into.push(prompt);
        return Promise.resolve(null);
      };

    const sent: string[] = [];
    await ask(appWith(record(sent)), { question });

    // What `translate` renders for the same question with no route in the way. Equality
    // rather than a substring check, because a database row is not the only thing a handler
    // could add: a prefix, a preamble or a second turn all fail this and none of them would
    // fail a check for a seeded name. The row half of the claim is in `ask.db.test.ts`.
    const rendered: string[] = [];
    await translate(question, record(rendered));

    expect(sent).toEqual(rendered);
  });

  it('rejects a body with no question', async () => {
    const response = await ask(appWith(answering('{"report":"outliers"}')), {});

    expect(response.statusCode).toBe(400);
  });

  it('rejects a question that is not a string', async () => {
    const response = await ask(appWith(answering('{"report":"outliers"}')), { question: 42 });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a field the route does not take, rather than ignoring it', async () => {
    const response = await ask(appWith(answering('{"report":"outliers"}')), {
      question: 'show me the pay bands',
      report: 'outliers',
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('the limit on POST /ask', () => {
  it('stops counting questions at the limit and says when to come back', async () => {
    let calls = 0;
    const app = appWith(() => {
      calls += 1;
      return Promise.resolve('Sure! Here are the pay bands for every country.');
    });

    const statuses: number[] = [];
    for (let index = 0; index < ASK_QUESTIONS + 1; index += 1) {
      statuses.push((await ask(app, { question: 'show me the pay bands' })).statusCode);
    }

    // The refused one never reaches the model, which is the whole point: the thing being
    // rationed is a paid call, not a row (PB-073).
    expect(statuses.slice(0, ASK_QUESTIONS)).toEqual(Array(ASK_QUESTIONS).fill(422));
    expect(statuses.at(-1)).toBe(429);
    expect(calls).toBe(ASK_QUESTIONS);
  });

  it('carries a retry-after inside the window it counts in', async () => {
    // A refusal rather than an accepted query: this app has no database to run one against.
    const app = appWith(answering('Sure! Here are the pay bands for every country.'));
    for (let index = 0; index < ASK_QUESTIONS; index += 1) {
      await ask(app, { question: 'who is outside their band' });
    }

    const refused = await ask(app, { question: 'who is outside their band' });
    const retryAfter = Number(refused.headers['retry-after']);

    expect(refused.statusCode).toBe(429);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(ASK_WINDOW_MS / 1000);
  });
});
