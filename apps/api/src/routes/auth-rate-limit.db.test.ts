import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { LOGIN_ATTEMPTS, LOGIN_WINDOW_MS } from '../auth/rate-limit';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from '../testing/db';
import { FIXTURE, FIXTURE_PASSWORD } from '../testing/fixture';

const EMAIL = FIXTURE.appUsers[0]?.email ?? '';

describe.skipIf(!hasTestDatabase())('login rate limit', () => {
  let prisma: PrismaClient;
  let app: App;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
    app = testApp(prisma, { signedIn: false });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function attempt(remoteAddress: string, password = 'wrong-password') {
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      remoteAddress,
      payload: { email: EMAIL, password },
    });
  }

  it('allows the documented number of attempts, then refuses with a wait', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < LOGIN_ATTEMPTS + 1; index += 1) {
      statuses.push((await attempt('10.0.0.1')).statusCode);
    }

    expect(statuses.slice(0, LOGIN_ATTEMPTS)).toEqual(Array(LOGIN_ATTEMPTS).fill(401));
    expect(statuses.at(-1)).toBe(429);
  });

  it('says how long to wait, within the documented window', async () => {
    for (let index = 0; index < LOGIN_ATTEMPTS; index += 1) await attempt('10.0.0.2');
    const refused = await attempt('10.0.0.2');

    const retryAfter = Number(refused.headers['retry-after']);
    expect(refused.statusCode).toBe(429);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(LOGIN_WINDOW_MS / 1000);
    expect(refused.json<{ message: string }>().message).toContain('Too many');
  });

  it('counts the right password too, so the limit cannot be stepped around', async () => {
    for (let index = 0; index < LOGIN_ATTEMPTS; index += 1) await attempt('10.0.0.3');
    const refused = await attempt('10.0.0.3', FIXTURE_PASSWORD);

    expect(refused.statusCode).toBe(429);
    expect(refused.headers['set-cookie']).toBeUndefined();
  });

  it('counts per address, so one jammed client does not lock everyone out', async () => {
    for (let index = 0; index < LOGIN_ATTEMPTS + 1; index += 1) await attempt('10.0.0.4');
    const elsewhere = await attempt('10.0.0.5', FIXTURE_PASSWORD);

    expect(elsewhere.statusCode).toBe(200);
  });

  it('leaves the rest of the API alone', async () => {
    for (let index = 0; index < LOGIN_ATTEMPTS + 1; index += 1) await attempt('10.0.0.6');
    const health = await app.inject({ method: 'GET', url: '/health', remoteAddress: '10.0.0.6' });

    expect(health.statusCode).toBe(200);
  });
});
