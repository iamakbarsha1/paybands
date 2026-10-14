import fastifyCookie from '@fastify/cookie';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { SESSION_COOKIE } from '../auth/session';
import {
  hasTestDatabase,
  resetAndSeed,
  testApp,
  testPrisma,
  TEST_SESSION_SECRET,
} from '../testing/db';
import { FIXTURE, FIXTURE_PASSWORD } from '../testing/fixture';

const HR = FIXTURE.appUsers[0];

/** The raw cookie string the browser would send back, forged with the app's own secret. */
function signed(value: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(fastifyCookie.sign(value, TEST_SESSION_SECRET))}`;
}

function setCookieHeader(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'];
  if (Array.isArray(raw)) return String(raw[0]);
  return typeof raw === 'string' ? raw : '';
}

describe.skipIf(!hasTestDatabase())('session auth', () => {
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

  async function login(
    password: string,
    email = HR?.email ?? '',
  ): Promise<ReturnType<App['inject']>> {
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });
  }

  it('signs in the seeded user and sets a cookie the browser will protect', async () => {
    const response = await login(FIXTURE_PASSWORD);
    const cookie = setCookieHeader(response.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json<{ user: { email: string } }>().user.email).toBe(HR?.email);
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    // The password must not come back in any form, hashed or otherwise.
    expect(response.body).not.toContain(FIXTURE_PASSWORD);
    expect(response.body).not.toContain('argon2');
  });

  it('refuses the wrong password and an unknown email the same way', async () => {
    const wrongPassword = await login('not-the-password');
    const unknownEmail = await login(FIXTURE_PASSWORD, 'nobody@paybands.example');

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    // Same body, so a probe cannot tell a real account from an invented one.
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });

  it('reads the session back on the next request', async () => {
    const response = await login(FIXTURE_PASSWORD);
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: setCookieHeader(response.headers).split(';')[0] ?? '' },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json<{ user: { email: string } }>().user.email).toBe(HR?.email);
  });

  it('refuses a session with no cookie, a tampered one, and an unsigned one', async () => {
    const userId = HR?.id ?? 0;
    const future = Date.now() + 60_000;

    const none = await app.inject({ method: 'GET', url: '/auth/me' });
    const tampered = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: `${signed(`${userId}.${future}`)}x` },
    });
    const unsigned = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: `${SESSION_COOKIE}=${userId}.${future}` },
    });

    expect(none.statusCode).toBe(401);
    expect(tampered.statusCode).toBe(401);
    expect(unsigned.statusCode).toBe(401);
  });

  it('refuses a session whose own expiry has passed, signature or not', async () => {
    const expired = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: signed(`${HR?.id ?? 0}.${Date.now() - 1_000}`) },
    });

    expect(expired.statusCode).toBe(401);
  });

  it('refuses a session for a user who is no longer in the table', async () => {
    const gone = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: signed(`999999.${Date.now() + 60_000}`) },
    });

    expect(gone.statusCode).toBe(401);
  });

  it('clears the cookie on logout', async () => {
    const response = await login(FIXTURE_PASSWORD);
    const cookie = setCookieHeader(response.headers).split(';')[0] ?? '';

    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    const cleared = setCookieHeader(out.headers);

    expect(out.statusCode).toBe(204);
    expect(cleared).toContain(`${SESSION_COOKIE}=;`);
    expect(cleared).toContain('HttpOnly');
  });
});
