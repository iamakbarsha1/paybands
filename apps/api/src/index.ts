import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { anthropicComplete } from './ask/anthropic';
import { createPrismaClient } from './db';

// Before anything reads an environment variable. `createPrismaClient` loads the file too,
// for scripts that start at the database, but by then this process has already asked for
// SESSION_SECRET and thrown.
if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';

const sessionSecret = process.env['SESSION_SECRET'];
if (sessionSecret === undefined || sessionSecret.length < 32) {
  throw new Error(
    'SESSION_SECRET must be set to at least 32 characters. Generate one with `openssl rand -base64 32`.',
  );
}

// The only place this variable is read. An unfilled line in a `.env` is the same as no line
// at all, so a blank key leaves the ask bar off rather than half on.
const anthropicKey = process.env['ANTHROPIC_API_KEY'] ?? '';

const prisma = createPrismaClient();
const app = buildApp({
  logger: true,
  prisma,
  sessionSecret,
  webOrigin: process.env['WEB_ORIGIN'] ?? 'http://localhost:3000',
  complete: anthropicKey === '' ? null : anthropicComplete(anthropicKey),
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
