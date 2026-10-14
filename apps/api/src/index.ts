import { buildApp } from './app';
import { createPrismaClient } from './db';

const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';

const sessionSecret = process.env['SESSION_SECRET'];
if (sessionSecret === undefined || sessionSecret.length < 32) {
  throw new Error(
    'SESSION_SECRET must be set to at least 32 characters. Generate one with `openssl rand -base64 32`.',
  );
}

const prisma = createPrismaClient();
const app = buildApp({ logger: true, prisma, sessionSecret });

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
