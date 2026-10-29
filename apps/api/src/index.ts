import { createAppFromEnv } from './server';

// This loads `.env` before it reads anything, so PORT and HOST are read after it and not
// before — otherwise a port set in the file would be ignored by the process that reads it.
const app = createAppFromEnv();

const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
