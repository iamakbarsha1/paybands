import '@fastify/cookie';
import { ROLES, type Role } from '@paybands/core';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'paybands_session';

/** Who a request is entitled to be, and what that entitles it to. */
export interface Session {
  readonly userId: number;
  readonly role: Role;
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** One working day. Long enough that nobody logs in twice a morning, short enough to matter. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Whether the browser and this API are on different sites, which decides `SameSite`.
 *
 * `Strict` is the safer value and the right one when both are served from the same
 * registrable domain. It is also the value that silently breaks a split deployment: a browser
 * on `app.vercel.app` talking to `api.onrender.com` is making a cross-site request, so it
 * discards a `Strict` cookie on arrival. The login then answers 200, sets a cookie that is
 * never stored, and every screen afterwards is signed out — a failure that looks like a bug in
 * the session code and is not (decision 63, `PB-D15`).
 *
 * `Lax` is not an option worth offering. It covers top-level navigation, and every request
 * this API serves is a `fetch` from a script, which Lax does not send either. So the choice is
 * two-valued, and it is modelled as a boolean rather than as the cookie vocabulary.
 */
export function sessionCookiePolicy(crossSite: boolean) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: crossSite ? ('none' as const) : ('strict' as const),
    path: '/',
  };
}

/**
 * The cookie carries the user id, the role and its own expiry, signed. The expiry is inside
 * the signature rather than left to `Max-Age` alone, because `Max-Age` is a request the
 * browser honours and a replayed cookie is not sent by a browser.
 *
 * There is no session table: logout clears the cookie, and a cookie stolen before then stays
 * valid until it expires. That ceiling is decision 50; a table of session ids is the upgrade.
 *
 * ponytail: the role rides in the cookie rather than being looked up per request, which
 * costs a query nobody makes and buys the same ceiling decision 50 already accepted — a
 * demotion takes effect at the next sign-in, not at the next request. The session table that
 * fixes revocation fixes this in the same move; until there is one, a role change needs a
 * sign-out, and that is the honest statement of it rather than a per-request round trip
 * bought against a risk this deployment does not carry.
 */
export function issueSession(
  reply: FastifyReply,
  session: Session,
  crossSite: boolean,
  now: Date = new Date(),
): void {
  const expiry = now.getTime() + SESSION_TTL_MS;
  reply.setCookie(SESSION_COOKIE, `${session.userId}.${session.role}.${expiry}`, {
    ...sessionCookiePolicy(crossSite),
    signed: true,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** Who a request is entitled to be, or null. Null covers missing, tampered and expired. */
export function readSession(request: FastifyRequest, now: Date = new Date()): Session | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (raw === undefined) return null;

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;

  const [id, role, expiresAt] = unsigned.value.split('.');
  if (id === undefined || role === undefined || expiresAt === undefined) return null;
  // A signed cookie from before this field existed parses as two parts, so it falls here
  // rather than being read as an admin whose role happened to be a number.
  if (!isRole(role)) return null;

  const userId = Number(id);
  const expiry = Number(expiresAt);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isFinite(expiry)) return null;
  if (expiry <= now.getTime()) return null;

  return { userId, role };
}

/** Cleared with the attributes it was set with, or the browser keeps the one it has. */
export function clearSession(reply: FastifyReply, crossSite: boolean): void {
  reply.clearCookie(SESSION_COOKIE, sessionCookiePolicy(crossSite));
}
