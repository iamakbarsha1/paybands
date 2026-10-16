import type { FastifyReply, FastifyRequest } from 'fastify';

/** Five attempts in fifteen minutes, per address. A person who forgot their password tries
 * three or four times; a script does not stop at five. */
export const LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Twenty questions in fifteen minutes, per session. A person reading the answers asks a
 * handful; a loop asks until the key is spent, and each question is a paid call (PB-073). */
export const ASK_QUESTIONS = 20;
export const ASK_WINDOW_MS = 15 * 60 * 1000;

/** Beyond this many addresses in one window the oldest entries go, so the map cannot grow
 * without bound on a public URL. The limit still holds for everyone currently counting. */
const MAX_TRACKED = 10_000;

interface Window {
  count: number;
  resetAt: number;
}

/**
 * A fixed window per key, held in memory. The key is whatever the caller counts by: an
 * address for the login route, a session id for the ask bar.
 *
 * The ceiling is one process: two instances mean two counters and twice the attempts, and a
 * client behind a proxy is counted as the proxy unless `trustProxy` is set. Decision 51
 * carries both, and a shared store is the upgrade when there is a second instance to share
 * one with.
 */
export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, Window>();

  return function take(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const at = now();
    const open = windows.get(key);

    if (open === undefined || open.resetAt <= at) {
      if (windows.size >= MAX_TRACKED) prune(windows, at);
      windows.set(key, { count: 1, resetAt: at + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    open.count += 1;
    if (open.count <= limit) return { allowed: true, retryAfterSeconds: 0 };

    return { allowed: false, retryAfterSeconds: Math.ceil((open.resetAt - at) / 1000) };
  };
}

function prune(windows: Map<string, Window>, at: number): void {
  for (const [address, open] of windows) {
    if (open.resetAt <= at) windows.delete(address);
  }
  // Still full of live windows: drop the oldest insertions rather than refuse everyone.
  if (windows.size >= MAX_TRACKED) {
    for (const address of [...windows.keys()].slice(0, windows.size - MAX_TRACKED + 1)) {
      windows.delete(address);
    }
  }
}

/**
 * The hook a route hangs a limiter on. Two routes have one: the login route counts by
 * address because there is no session yet (PB-052), and the ask route counts by session
 * because there always is one and a paid call is worth more than an address (PB-073).
 *
 * `refusal` is the route's own sentence, because the two are told to different people — one
 * to somebody who cannot get in, one to somebody who is already in.
 */
export function limitHook(
  take: ReturnType<typeof createLimiter>,
  keyOf: (request: FastifyRequest) => string,
  refusal: (retryAfterSeconds: number) => string,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const { allowed, retryAfterSeconds } = take(keyOf(request));
    if (allowed) return;

    await reply
      .code(429)
      .header('retry-after', String(retryAfterSeconds))
      .send({ message: refusal(retryAfterSeconds) });
  };
}
