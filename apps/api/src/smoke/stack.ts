import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { hasTestDatabase, resetAndSeed, testDatabaseUrl, testPrisma } from '../testing/db';
import { FIXTURE, FIXTURE_PASSWORD } from '../testing/fixture';
import migrate from '../testing/global-setup';

/**
 * The one browser smoke `design-notes.md` §6 names. It is neither an API test nor a web
 * test: it starts both processes against a seeded database and drives Chromium at them, so
 * it lives beside the fixture and the database helpers it reuses rather than in either app.
 *
 * Three things, chosen because each one fails for a different reason and none of them is
 * covered anywhere else: a password reaching a session cookie, a report screen turning a
 * response into rendered money, and the ask bar's off-state. Everything below that line is
 * already held by 351 unit and integration tests, and a browser is the slowest place to
 * re-check any of it (decision 61).
 *
 * The server is started with no `ANTHROPIC_API_KEY`, which is the deployment this repository
 * ships by default and the state the third assertion is about.
 */

const WEB_PORT = 3100;
const API_PORT = 3101;

export const WEB_URL = `http://127.0.0.1:${String(WEB_PORT)}`;
const API_URL = `http://127.0.0.1:${String(API_PORT)}`;

/** Long enough for `index.ts` to accept it. It signs cookies that live for one test run. */
const SMOKE_SESSION_SECRET = 'paybands-smoke-session-secret-0123456789';

/** `next dev` compiles each route on its first request, which is most of this budget. */
const READY_TIMEOUT_MS = 120_000;

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WEB_ROOT = fileURLToPath(new URL('../../../web', import.meta.url));

/** The seeded login, read from the fixture so the two cannot drift. */
export const SMOKE_LOGIN = {
  email: FIXTURE.appUsers[0]?.email ?? 'hr@paybands.example',
  password: FIXTURE_PASSWORD,
} as const;

/**
 * The fixture drops one of the 48 bands so an employee with no band exists to report, and
 * the band table renders every row it is given. A count rather than a non-empty check: a
 * screen that renders one row and a screen that renders the table is the same assertion
 * otherwise.
 */
export const EXPECTED_BAND_ROWS = FIXTURE.payBands.length;

/** Playwright resolves the path whether or not the download ever happened. */
function hasChromium(): boolean {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/**
 * Both halves of the gate, so the test file skips for the same reason the setup declines to
 * start anything. A missing browser is a skip locally and a failure in CI for the reason
 * decision 46 gives for the database: a skipped suite and a passing one look identical in a
 * green build.
 */
export function canRunSmoke(): boolean {
  const ready = hasTestDatabase() && hasChromium();

  if (!ready && process.env['CI'] !== undefined && process.env['CI'] !== '') {
    throw new Error(
      `CI runs the smoke; it does not skip it. TEST_DATABASE_URL set: ${String(hasTestDatabase())}, ` +
        `Chromium present: ${String(hasChromium())} (install it with \`pnpm exec playwright install chromium\`).`,
    );
  }

  return ready;
}

function start(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv) {
  return spawn(command, [...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group: `next dev` forks a compiler, and killing only the parent
    // leaves that child holding the port for the next run.
    detached: true,
  });
}

async function waitForOk(url: string, label: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError = 'no response yet';

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited with code ${String(child.exitCode)} before it was ready.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${String(response.status)}`;
    } catch (thrown: unknown) {
      lastError = thrown instanceof Error ? thrown.message : String(thrown);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `${label} was not ready at ${url} within ${String(READY_TIMEOUT_MS)}ms: ${lastError}`,
  );
}

function stop(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    // Negative pid is the group, which is why `detached` is set above.
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

/**
 * Seeds the fixture, then starts the two processes a browser needs in front of it. Returns
 * vitest's teardown, so a failed assertion still takes the ports down with it.
 */
export default async function setup(): Promise<(() => void) | undefined> {
  if (!canRunSmoke()) {
    console.log('Skipping the browser smoke. Needs TEST_DATABASE_URL and an installed Chromium.');
    return undefined;
  }

  const databaseUrl = testDatabaseUrl();
  // The same migration step `api-db` runs, so `vitest --project smoke` on its own still
  // meets a migrated database rather than failing on a table that was never created.
  migrate();

  const prisma = testPrisma();
  try {
    await resetAndSeed(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const api = start(process.execPath, ['--import', 'tsx', 'src/index.ts'], API_ROOT, {
    PORT: String(API_PORT),
    HOST: '127.0.0.1',
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: SMOKE_SESSION_SECRET,
    WEB_ORIGIN: WEB_URL,
    // The off-state the third assertion is about. Measured, not assumed: `loadEnvFile`
    // leaves a variable already in the environment alone, so a developer's `.env` key
    // cannot turn the ask bar on underneath this run.
    ANTHROPIC_API_KEY: '',
    TRUST_PROXY: '',
  });

  const web = start(
    fileURLToPath(new URL('../../../web/node_modules/.bin/next', import.meta.url)),
    ['dev', '--port', String(WEB_PORT), '--hostname', '127.0.0.1'],
    WEB_ROOT,
    { NEXT_PUBLIC_API_URL: API_URL },
  );

  const teardown = (): void => {
    stop(web);
    stop(api);
  };

  try {
    await waitForOk(`${API_URL}/health`, 'the API', api);
    await waitForOk(`${WEB_URL}/login`, 'the web app', web);
  } catch (thrown: unknown) {
    teardown();
    throw thrown;
  }

  return teardown;
}
