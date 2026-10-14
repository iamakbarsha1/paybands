import type { FastifyReply, FastifyRequest } from 'fastify';

/** Five attempts in fifteen minutes, per address. A person who forgot their password tries
 * three or four times; a script does not stop at five. */
export const LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Beyond this many addresses in one window the oldest entries go, so the map cannot grow
 * without bound on a public URL. The limit still holds for everyone currently counting. */
const MAX_TRACKED = 10_000;

interface Window {
  count: number;
  resetAt: number;
}

/**
 * A fixed window per address, held in memory.
 *
 * The ceiling is one process: two instances mean two counters and twice the attempts, and a
 * client behind a proxy is counted as the proxy unless `trustProxy` is set. Decision 51
 * carries both, and a shared store is the upgrade when there is a second instance to share
 * one with.
 */
export function createLoginLimiter(now: () => number = Date.now) {
  const windows = new Map<string, Window>();

  return function take(address: string): { allowed: boolean; retryAfterSeconds: number } {
    const at = now();
    const open = windows.get(address);

    if (open === undefined || open.resetAt <= at) {
      if (windows.size >= MAX_TRACKED) prune(windows, at);
      windows.set(address, { count: 1, resetAt: at + LOGIN_WINDOW_MS });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    open.count += 1;
    if (open.count <= LOGIN_ATTEMPTS) return { allowed: true, retryAfterSeconds: 0 };

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

/** The hook the login route hangs it on. Nothing else is limited (PB-052). */
export function loginLimitHook(
  take: ReturnType<typeof createLoginLimiter>,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const { allowed, retryAfterSeconds } = take(request.ip);
    if (allowed) return;

    await reply
      .code(429)
      .header('retry-after', String(retryAfterSeconds))
      .send({ message: `Too many sign-in attempts. Try again in ${retryAfterSeconds} seconds.` });
  };
}
