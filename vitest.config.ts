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
    ],
  },
});
