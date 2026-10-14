import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'paybands_session';

/** One working day. Long enough that nobody logs in twice a morning, short enough to matter. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * The cookie carries the user id and its own expiry, signed. The expiry is inside the
 * signature rather than left to `Max-Age` alone, because `Max-Age` is a request the browser
 * honours and a replayed cookie is not sent by a browser.
 *
 * There is no session table: logout clears the cookie, and a cookie stolen before then stays
 * valid until it expires. That ceiling is decision 50; a table of session ids is the upgrade.
 */
export function issueSession(reply: FastifyReply, userId: number, now: Date = new Date()): void {
  reply.setCookie(SESSION_COOKIE, `${userId}.${now.getTime() + SESSION_TTL_MS}`, {
    signed: true,
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** The user id a request is entitled to, or null. Null covers missing, tampered and expired. */
export function readSession(request: FastifyRequest, now: Date = new Date()): number | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (raw === undefined) return null;

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;

  const [id, expiresAt] = unsigned.value.split('.');
  if (id === undefined || expiresAt === undefined) return null;

  const userId = Number(id);
  const expiry = Number(expiresAt);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isFinite(expiry)) return null;
  if (expiry <= now.getTime()) return null;

  return userId;
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });
}
