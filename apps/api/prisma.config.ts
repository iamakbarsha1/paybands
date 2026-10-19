import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 reads connection details from here, not from the datasource block.
// Node 24 loads the env file itself, so no dotenv dependency.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx src/seed/index.ts' },
  datasource: {
    // Migrations only. They take advisory locks and create a shadow database,
    // so they run against Neon's direct endpoint — the same host without
    // `-pooler`. The app connects through the pooled `DATABASE_URL` instead,
    // which from Prisma 7 is the driver adapter's business, not this file's.
    // Read late, not through `env()`. This file is loaded by every Prisma
    // command, including the `prisma generate` that `postinstall` runs — which
    // happens on CI, on a platform build and on a fresh clone, none of which
    // have a DIRECT_URL. `env()` throws there and takes `pnpm install` with it.
    // Generate needs no connection; the migrate commands do, and they fail on
    // the empty string.
    url: process.env.DIRECT_URL ?? '',
  },
});
