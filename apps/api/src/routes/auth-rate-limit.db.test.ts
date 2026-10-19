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

/** Every request arrives from here, which is what a proxy does to an address. */
const PROXY = '10.1.1.1';
const GUESSER = '203.0.113.10';
const BYSTANDER = '203.0.113.99';

/**
 * Half of decision 51's falsifier — *"a proxy in front of one ... makes it wrong in the other
 * direction, and dangerous"* — fired here rather than waited for. A deployment is not needed
 * to show it: `inject` can put every request behind one address and name the real client in
 * `X-Forwarded-For`, which is exactly what a platform proxy does.
 *
 * What the two tests prove is that the limiter is correct either way and the configuration
 * is the whole of the risk. Untrusted, five wrong passwords from one client refuse the next
 * person through the same proxy — every visitor, on a public URL. Trusted, the same five
 * refuse only the client that sent them.
 */
describe.skipIf(!hasTestDatabase())('login rate limit behind a proxy', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function forwarded(instance: App, client: string, password = 'wrong-password') {
    return instance.inject({
      method: 'POST',
      url: '/auth/login',
      remoteAddress: PROXY,
      headers: { 'x-forwarded-for': client },
      payload: { email: EMAIL, password },
    });
  }

  it('counts the proxy as the client when it is not trusted, and locks out everyone behind it', async () => {
    const behindProxy = testApp(prisma, { signedIn: false });
    for (let index = 0; index < LOGIN_ATTEMPTS; index += 1) await forwarded(behindProxy, GUESSER);

    const bystander = await forwarded(behindProxy, BYSTANDER, FIXTURE_PASSWORD);

    expect(bystander.statusCode).toBe(429);
    await behindProxy.close();
  });

  it('counts the forwarded client once the proxy is trusted, and refuses only the guesser', async () => {
    const behindProxy = testApp(prisma, { signedIn: false, trustProxy: true });
    for (let index = 0; index < LOGIN_ATTEMPTS; index += 1) await forwarded(behindProxy, GUESSER);

    const bystander = await forwarded(behindProxy, BYSTANDER, FIXTURE_PASSWORD);
    const guesser = await forwarded(behindProxy, GUESSER, FIXTURE_PASSWORD);

    expect(bystander.statusCode).toBe(200);
    expect(guesser.statusCode).toBe(429);
    await behindProxy.close();
  });
});
