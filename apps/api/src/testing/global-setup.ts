import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Applies migrations once per run, so a test file never has to. A missing URL is a skip
 * locally and a failure in CI, because a skipped integration suite and a passing one look
 * identical in a green build (decision 46).
 */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;

  if (url === undefined || url === '') {
    if (process.env.CI !== undefined && process.env.CI !== '') {
      throw new Error(
        'TEST_DATABASE_URL is not set. CI runs the database tests; it does not skip them.',
      );
    }
    console.log('TEST_DATABASE_URL is not set — skipping the database tests.');
    console.log('Run `docker compose up -d`, then export the URL printed in README.md.');
    return;
  }

  // `prisma.config.ts` migrates through DIRECT_URL and loads `apps/api/.env` on the way.
  // Variables already in the environment win over that file, so the development database
  // cannot be reached from here.
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
