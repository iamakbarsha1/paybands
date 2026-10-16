import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from './app';
import { testApp, unusedPrisma } from './testing/db';
import { z } from 'zod';

const brokenResponseSchema = z.object({ count: z.number() });

let app: App;

beforeAll(() => {
  app = testApp(unusedPrisma());
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('answers 200 without authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    // `ask` says whether this server was given a way to a model, so the browser knows
    // whether to render an ask bar. This app was built without one.
    expect(response.json()).toEqual({ status: 'ok', ask: false });
  });
});

// `/reference` reads the country, department and level tables, so its tests moved to
// `reference.db.test.ts` where there is a database to read.

describe('an unknown route', () => {
  it('answers 404 rather than falling through to a handler', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
  });
});

describe('the zod boundary', () => {
  it('rejects an unknown query parameter rather than ignoring it', async () => {
    const response = await app.inject({ method: 'GET', url: '/reference?departmant=2' });

    expect(response.statusCode).toBe(400);
  });

  it('names the offending field in the error, so a typo is findable', async () => {
    const response = await app.inject({ method: 'GET', url: '/reference?departmant=2' });

    expect(JSON.stringify(response.json())).toMatch(/departmant/);
  });

  it('leaves /health open to a probe that adds its own query string', async () => {
    const response = await app.inject({ method: 'GET', url: '/health?probe=k8s' });

    expect(response.statusCode).toBe(200);
  });

  it('answers a 500 with a sentence of its own, not with the error it caught', async () => {
    // `unusedPrisma` throws on the first property read, so this is a handler failing the
    // way a driver fault would: nobody wrote a reply for it.
    const response = await app.inject({ method: 'GET', url: '/analytics/bands' });
    const body = JSON.stringify(response.json());

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: 'Something went wrong.' });
    // The thrown message names `prisma`, and a browser is the wrong place to read it.
    expect(body).not.toMatch(/prisma/i);
  });

  it('keeps a 4xx message, which the screens render and the server wrote', async () => {
    const response = await app.inject({ method: 'GET', url: '/reference?departmant=2' });

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toMatch(/departmant/);
  });

  it('answers 500 rather than a malformed body when a handler breaks its response schema', async () => {
    const broken = testApp(unusedPrisma());
    // The cast is the point: without it the type provider refuses to compile this
    // handler, which is the compile-time half of what the 500 proves at runtime.
    broken.get(
      '/broken',
      { schema: { response: { 200: brokenResponseSchema } } },
      () => ({ count: 'not a number' }) as unknown as { count: number },
    );
    const response = await broken.inject({ method: 'GET', url: '/broken' });
    await broken.close();

    expect(response.statusCode).toBe(500);
  });
});
