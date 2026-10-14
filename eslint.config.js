import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      // Prisma's client, regenerated from the schema on every install. Linting
      // it reports on code nobody here writes or can fix.
      '**/generated/**',
      '**/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // The web app's PostCSS config is not in any tsconfig: it is configuration Next
        // reads at build time, and it still gets linted.
        projectService: { allowDefaultProject: ['*.ts', '*.js', 'apps/web/*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // An unawaited promise in a money or database path is a silent data bug.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // packages/core exists so the comp arithmetic is testable with no framework,
  // database or I/O. Without this rule that boundary is a convention one import
  // can break. See docs/decisions/decision-log.md, decision 4.
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'fastify',
                'fastify/*',
                'next',
                'next/*',
                'react',
                'react-dom',
                '@prisma/client',
                'node:fs',
                'node:net',
                'node:http',
                'node:https',
                'node:child_process',
              ],
              message:
                '@paybands/core stays free of frameworks and I/O. See docs/decisions/decision-log.md, decision 4.',
            },
          ],
        },
      ],
    },
  },

  // Handlers talk to repositories, repositories talk to Prisma (decision 47). Type-only
  // imports are allowed through, because a handler naming the client's type still cannot
  // run a query with it.
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/db.ts',
      'apps/api/src/repositories/**',
      'apps/api/src/seed/**',
      'apps/api/src/testing/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/generated/prisma/**', '@prisma/client', '@prisma/adapter-pg'],
              allowTypeImports: true,
              message:
                'Queries live in apps/api/src/repositories. See docs/decisions/decision-log.md, decision 47.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
);
