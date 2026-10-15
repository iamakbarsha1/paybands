import { describe, expect, it } from 'vitest';
import { buildApp, type App } from './app';
import { TEST_SESSION_SECRET, unusedPrisma } from './testing/db';

const WEB = 'http://localhost:3000';

function appFor(origin: string) {
  return buildApp({
    prisma: unusedPrisma(),
    sessionSecret: TEST_SESSION_SECRET,
    webOrigin: origin,
  });
}

/**
 * The methods Fastify actually serves, read off its own route table rather than listed by
 * hand: a route added with a method the preflight does not name is a route the browser
 * cannot call.
 */
function methodsServed(app: App): string[] {
  const lists = app.printRoutes({ commonPrefix: false }).matchAll(/\((?<methods>[A-Z,\s]+)\)/gu);
  const methods = new Set(
    [...lists].flatMap((match) =>
      (match.groups?.['methods'] ?? '').split(',').map((method) => method.trim()),
    ),
  );
  // Fastify answers these itself; the browser never asks permission for them.
  methods.delete('OPTIONS');
  methods.delete('HEAD');

  return [...methods];
}

describe('CORS', () => {
  it('lets the web origin through, with credentials', async () => {
    const app = appFor(WEB);
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: {
        origin: WEB,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    await app.close();

    expect(response.headers['access-control-allow-origin']).toBe(WEB);
    // Without this the browser drops the session cookie on every cross-origin call.
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows every method the route table serves, not just the safelisted three', async () => {
    const app = appFor(WEB);
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/employees/1',
      headers: { origin: WEB, 'access-control-request-method': 'PATCH' },
    });
    const served = methodsServed(app);
    await app.close();

    const allowed = String(response.headers['access-control-allow-methods'])
      .split(',')
      .map((method) => method.trim());
    // PATCH is the one that bites: the browser's default allowance covers GET, HEAD and POST,
    // so an edit form fails in preflight while every test that injects straight at the route
    // passes (PB-058).
    expect(served).toContain('PATCH');
    for (const method of served) expect(allowed).toContain(method);
  });

  it('refuses an origin that is not the web app', async () => {
    const app = appFor(WEB);
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    await app.close();

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never answers with a wildcard, which cannot carry credentials anyway', async () => {
    const app = appFor(WEB);
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: WEB },
    });
    await app.close();

    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });
});
