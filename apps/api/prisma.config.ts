import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 reads connection details from here, not from the datasource block.
// Node 24 loads the env file itself, so no dotenv dependency.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations only. They take advisory locks and create a shadow database,
    // so they run against Neon's direct endpoint — the same host without
    // `-pooler`. The app connects through the pooled `DATABASE_URL` instead,
    // which from Prisma 7 is the driver adapter's business, not this file's.
    url: env('DIRECT_URL'),
  },
});
