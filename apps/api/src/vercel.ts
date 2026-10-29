import type { IncomingMessage, ServerResponse } from 'node:http';
import { createAppFromEnv } from './server';

/**
 * The same app, reached one request at a time instead of through a listening socket.
 *
 * Built at module scope on purpose: Fluid Compute reuses an instance across invocations, so
 * the plugin graph and the Prisma pool are paid for on a cold start rather than per request.
 * A missing SESSION_SECRET throws here, which fails the instance loudly at boot instead of
 * answering every request as a stranger.
 *
 * The logger stays on. The platform records the status and duration of every invocation but
 * not what Fastify caught, and the error handler deliberately refuses to tell the browser
 * (`PB-073`) — so with the logger off a 500 has no cause written down anywhere.
 */
const app = createAppFromEnv({ logger: true });
const ready = app.ready();

export default async function handler(
  request: IncomingMessage,
  reply: ServerResponse,
): Promise<void> {
  await ready;
  // Fastify's own server never listens here. Handing it the request directly is what the
  // platform's Node entry point is for, and routing, validation and the hooks are unchanged.
  app.server.emit('request', request, reply);
}
