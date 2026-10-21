import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api',
          root: './apps/api',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          // Keeping the default exclude list, plus the tests that need Postgres.
          exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.db.test.ts'],
        },
      },
      {
        test: {
          name: 'api-db',
          root: './apps/api',
          environment: 'node',
          include: ['src/**/*.db.test.ts'],
          // Applies migrations once, or explains why the suite is about to skip.
          globalSetup: ['./src/testing/global-setup.ts'],
          // One database and one set of fixture rows: files share them, so they take turns.
          fileParallelism: false,
        },
      },
      {
        // The screens, in jsdom. No server and no network: `lib/api` is stubbed per file, so
        // what is under test is the branch the screen takes on an answer, not the fetch.
        // Node rather than a browser because the thing these cover is which of loading,
        // empty, error and ready gets rendered — `smoke` already drives a real browser.
        test: {
          name: 'web',
          root: './apps/web',
          environment: 'jsdom',
          include: ['{app,components,lib}/**/*.test.{ts,tsx}'],
          setupFiles: ['./testing/setup.ts'],
        },
        // `tsconfig.json` leaves JSX for Next to compile (`"jsx": "preserve"`). Vitest never
        // loads Next, so the transform has to be named here or every `.tsx` is a parse error.
        oxc: { jsx: { runtime: 'automatic' } },
      },
      {
        test: {
          name: 'smoke',
          // Rooted in the API because that is where the fixture and the database helpers
          // live. It drives the web app in a browser; it belongs to neither app alone.
          root: './apps/api',
          environment: 'node',
          include: ['src/smoke/**/*.smoke.ts'],
          // Seeds the fixture and starts both servers, or says why it is about to skip.
          globalSetup: ['./src/smoke/stack.ts'],
          // Projects run in parallel unless told otherwise, and `api-db` truncates the same
          // database this one seeds. A later group than every other project, so the two
          // suites take turns rather than clobbering each other's rows.
          sequence: { groupOrder: 1 },
          // One browser against one pair of ports.
          fileParallelism: false,
          // `next dev` compiles each route on its first request, and `api-db` has already
          // migrated the database this run shares.
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
