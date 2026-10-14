import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { TEST_SESSION_SECRET, unusedPrisma } from './testing/db';

const WEB = 'http://localhost:3000';

function appFor(origin: string) {
  return buildApp({
    prisma: unusedPrisma(),
    sessionSecret: TEST_SESSION_SECRET,
    webOrigin: origin,
  });
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
