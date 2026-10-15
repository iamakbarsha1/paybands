import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../app';
import type { Complete } from '../ask/translate';
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
