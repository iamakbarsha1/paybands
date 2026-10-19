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
  trustProxy: trustProxyFromEnv(process.env['TRUST_PROXY']),
  crossSiteCookie: flag(process.env['CROSS_SITE_COOKIE']),
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

/**
 * Whether Fastify may read the client's address out of `X-Forwarded-For`, which decides what
 * `request.ip` is and therefore what both rate limiters count by (decision 51). `true` trusts
 * the nearest hop, which is what a single platform proxy needs; anything else is handed to
 * Fastify as the addresses or subnets it may trust. Unset is off: right for a server reached
 * directly, and wrong behind a proxy, where it counts the whole internet as one client.
 * `PB-078` is where the deployment sets it.
 */
/**
 * `CROSS_SITE_COOKIE` is on only for the exact string `true`. Unset, empty and anything else
 * leave the session cookie at `SameSite=Strict`, because the safer value is the one a typo
 * should fall back to. `PB-079` is where a split deployment sets it.
 */
function flag(raw: string | undefined): boolean {
  return raw?.trim() === 'true';
}

function trustProxyFromEnv(raw: string | undefined): boolean | string {
  if (raw === undefined || raw.trim() === '') return false;
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
