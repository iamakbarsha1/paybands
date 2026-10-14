import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { PUBLIC_PATHS } from '../auth/guard';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from '../testing/db';
import { FIXTURE, FIXTURE_PASSWORD } from '../testing/fixture';

interface Route {
  readonly method: string;
  readonly url: string;
}

/**
 * The route table as Fastify holds it, not a list kept by hand: a route added without a
 * thought about auth has to show up here (PB-053).
 */
function routeTable(app: App): Route[] {
  const lines = app.printRoutes({ commonPrefix: false }).split('\n');
  const stack: string[] = [];
  const routes: Route[] = [];

  for (const line of lines) {
    const match = /^(?<indent>[\s│├└─]*?)(?<path>\/\S*)\s+\((?<methods>[^)]+)\)\s*$/u.exec(line);
    if (match?.groups === undefined) continue;

    // Four characters of tree drawing per level: `├── /employees`, then `    └── /:id`.
    const depth = Math.floor((match.groups['indent'] ?? '').length / 4);
    stack.length = Math.max(depth - 1, 0);
    stack.push(match.groups['path'] ?? '');

    const url = stack.join('');
    for (const method of (match.groups['methods'] ?? '').split(',')) {
      routes.push({ method: method.trim(), url });
    }
  }

  return routes;
}

describe.skipIf(!hasTestDatabase())('the guard', () => {
  let prisma: PrismaClient;
  let app: App;
  let cookie: string;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = testApp(prisma);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: FIXTURE.appUsers[0]?.email ?? '', password: FIXTURE_PASSWORD },
    });
    const raw = login.headers['set-cookie'];
    cookie = (Array.isArray(raw) ? String(raw[0]) : String(raw)).split(';')[0] ?? '';
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('finds the whole route table, nested paths included', () => {
    const urls = routeTable(app).map((route) => route.url);

    expect(urls).toContain('/health');
    expect(urls).toContain('/analytics/pay-gap');
    expect(urls).toContain('/employees/:id/salary');
    expect(urls.length).toBeGreaterThan(10);
  });

  it('refuses every route outside the allowlist without a session', async () => {
    const routes = routeTable(app).filter((route) => !PUBLIC_PATHS.has(route.url));
    expect(routes.length).toBeGreaterThan(8);

    for (const route of routes) {
      const response = await app.inject({
        method: route.method as 'GET',
        url: route.url.replace(':id', '1'),
      });

      expect(`${route.method} ${route.url} -> ${response.statusCode}`).toBe(
        `${route.method} ${route.url} -> 401`,
      );
    }
  });

  it('lets the allowlist through without a session', async () => {
    const health = await app.inject({ method: 'GET', url: '/health' });
    const logout = await app.inject({ method: 'POST', url: '/auth/logout' });
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@paybands.example', password: 'wrong' },
    });

    expect(health.statusCode).toBe(200);
    expect(logout.statusCode).toBe(204);
    // 401 because the credentials are wrong, not because the guard stopped it.
    expect(login.statusCode).toBe(401);
  });

  it('answers the same routes once a session is in hand', async () => {
    const employees = await app.inject({ method: 'GET', url: '/employees', headers: { cookie } });
    const bands = await app.inject({
      method: 'GET',
      url: '/analytics/bands',
      headers: { cookie },
    });

    expect(employees.statusCode).toBe(200);
    expect(bands.statusCode).toBe(200);
  });

  it('stops a request before it is parsed, not after', async () => {
    // A body that would fail validation: a 401 proves the guard ran before the schema,
    // which is what stops an unauthenticated probe from reading the validation errors.
    const response = await app.inject({
      method: 'POST',
      url: '/employees',
      payload: { nonsense: true },
    });

    expect(response.statusCode).toBe(401);
  });
});
