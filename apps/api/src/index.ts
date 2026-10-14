import { buildApp } from './app';
import { createPrismaClient } from './db';

const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';

const prisma = createPrismaClient();
const app = buildApp({ logger: true, prisma });

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
