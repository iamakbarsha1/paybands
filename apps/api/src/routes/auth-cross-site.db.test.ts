import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { hasTestDatabase, resetAndSeed, testApp, testPrisma } from '../testing/db';
import { FIXTURE, FIXTURE_PASSWORD } from '../testing/fixture';

/**
 * `SameSite` on the session cookie, both ways round (`PB-D15`, decision 63).
 *
 * This is the leg of the deployment that answers 200 and does nothing. A browser on one site
 * talking to an API on another discards a `Strict` cookie on arrival, so the login succeeds,
 * the cookie is never stored, and every screen afterwards is signed out. Nothing in the API
 * sees it: the response is correct and the next request simply has no cookie on it.
 *
 * Found by running the browser smoke with the page on `localhost` and the API on `127.0.0.1`,
 * which is cross-site by the same rule as two different deployment hosts. The login returned
 * 200 with a well-formed `Set-Cookie`, Chromium's jar was empty, and `/auth/me` answered 401.
 */

const HR = FIXTURE.appUsers[0];

function setCookieHeader(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'];
  if (Array.isArray(raw)) return String(raw[0]);
  return typeof raw === 'string' ? raw : '';
}

describe.skipIf(!hasTestDatabase())('the session cookie across sites', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = testPrisma();
    await resetAndSeed(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function login(crossSiteCookie: boolean): Promise<string> {
    const app = testApp(prisma, { signedIn: false, crossSiteCookie });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: HR?.email, password: FIXTURE_PASSWORD },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    return setCookieHeader(response.headers);
  }

  it('is Strict by default, which is right when the browser is on the same site', async () => {
    const cookie = await login(false);
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('SameSite=None');
  });

  it('is None when the deployment is split, so the browser keeps it', async () => {
    const cookie = await login(true);
    expect(cookie).toContain('SameSite=None');
    expect(cookie).not.toContain('SameSite=Strict');
  });

  it('stays HttpOnly and Secure either way, because only SameSite is in question', async () => {
    for (const crossSite of [false, true]) {
      const cookie = await login(crossSite);
      expect(cookie).toContain('HttpOnly');
      // `SameSite=None` without `Secure` is rejected by every current browser, so this
      // assertion is what stops the cross-site setting from being a cookie nobody stores.
      expect(cookie).toContain('Secure');
    }
  });

  /**
   * `SameSite=None` gives up the browser's CSRF defence, and this is what is left. A form
   * posted from another site travels with the cookie and cannot set a JSON content type, so
   * it has to be refused before a handler runs. Asserted rather than argued, because the
   * deploy document makes this claim in writing.
   */
  it('refuses a form-encoded write even from a signed-in session', async () => {
    const app = testApp(prisma);
    const response = await app.inject({
      method: 'POST',
      url: '/employees',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'firstName=Mallory&lastName=Attacker',
    });
    await app.close();

    expect(response.statusCode).toBe(415);
  });

  it('clears with the attributes it was set with, or the browser keeps the old one', async () => {
    const app = testApp(prisma, { crossSiteCookie: true });
    const response = await app.inject({ method: 'POST', url: '/auth/logout' });
    await app.close();

    expect(response.statusCode).toBe(204);
    expect(setCookieHeader(response.headers)).toContain('SameSite=None');
  });
});
