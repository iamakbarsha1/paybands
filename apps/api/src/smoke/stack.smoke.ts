import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { EXPECTED_BAND_ROWS, SMOKE_LOGIN, WEB_URL, canRunSmoke } from './stack';

/**
 * One browser, three things no other suite can see: that a typed password becomes a session
 * the next screen is allowed through with, that a report turns a response into rendered
 * money, and that the ask bar is absent on a server started without a key.
 *
 * `@playwright/test` is not used, so there is no second runner and no second config. That
 * costs the web-first assertions: every wait below is explicit, and says what it waits for.
 */

const BUDGET_MS = 60_000;

describe.skipIf(!canRunSmoke())('the deployed stack, in a browser', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  }, BUDGET_MS);

  afterAll(async () => {
    await browser.close();
  });

  async function signedIn(): Promise<Page> {
    const page = await browser.newPage();
    await page.goto(`${WEB_URL}/login`);

    await page.getByLabel('Email').fill(SMOKE_LOGIN.email);
    await page.getByLabel('Password').fill(SMOKE_LOGIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL(`${WEB_URL}/employees`);
    return page;
  }

  test(
    'a password becomes a session the next screen is let through with',
    async () => {
      const page = await signedIn();

      // The nav only draws once `SessionGate` has had `/auth/me` answer 200, which it can
      // only do with the cookie the login just set. A redirect to /login would hang the
      // wait above; this is the half that proves the cookie travelled.
      await page.getByRole('button', { name: 'Sign out' }).waitFor();
      await page.locator('tbody[aria-label="Employees"][aria-busy="false"]').waitFor();

      expect(await page.getByRole('heading', { name: 'Employees' }).isVisible()).toBe(true);
      await page.close();
    },
    BUDGET_MS,
  );

  test(
    'the band report renders the seeded bands as money',
    async () => {
      const page = await signedIn();
      await page.goto(`${WEB_URL}/reports/bands`);

      // `aria-busy="false"` is the screen saying the fetch landed. Asserting on the rows
      // before it is asserting on 48 skeletons.
      const body = page.locator('tbody[aria-label="Pay bands"][aria-busy="false"]');
      await body.waitFor();

      expect(await body.locator('tr').count()).toBe(EXPECTED_BAND_ROWS);

      // A rendered amount, not a placeholder: `formatMoney` is the last step between the
      // wire and the reader, and a skeleton row has no currency symbol in it.
      const firstRow = await body.locator('tr').first().innerText();
      expect(firstRow).toMatch(/[$£€₹¥]/u);

      await page.close();
    },
    BUDGET_MS,
  );

  test(
    'the ask bar is absent on a server started without a key',
    async () => {
      const page = await signedIn();

      const health = page.waitForResponse((response) => response.url().endsWith('/health'));
      await page.goto(`${WEB_URL}/reports`);

      // Absence is only evidence once the answer that decides it has arrived, and only if
      // the answer said the feature is off. Checked before the box is looked for, so a
      // server that had a key after all fails here rather than passing silently.
      expect(((await (await health).json()) as { ask: boolean }).ask).toBe(false);
      await page.getByRole('heading', { name: 'Reports' }).waitFor();

      expect(await page.getByLabel('Ask a question').count()).toBe(0);
      await page.close();
    },
    BUDGET_MS,
  );

  test(
    'the same locator finds the ask bar when health says the key is there',
    async () => {
      // The negative above passes against a broken locator, a crashed page and a feature
      // that was never built. This is the case that fails if any of those is true: the
      // health answer is swapped for an `ask: true` one and the box has to appear.
      const page = await signedIn();
      await page.route('**/health', async (route) => {
        await route.fulfill({ json: { status: 'ok', ask: true } });
      });
      await page.goto(`${WEB_URL}/reports`);

      await page.getByLabel('Ask a question').waitFor();
      expect(await page.getByLabel('Ask a question').count()).toBe(1);

      await page.close();
    },
    BUDGET_MS,
  );
});
