import type { App } from '../app';
import { readSession } from './session';

/**
 * The only paths that answer without a session. One declaration rather than a flag per
 * route, so a route added tomorrow is private by default and opening it is a visible edit
 * to this line.
 *
 * Logout is here so an expired session can still clear its cookie. It is a `POST` and the
 * cookie is `SameSite=Strict`, so the worst a forged one does is sign someone out.
 */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  '/health',
  '/auth/login',
  '/auth/logout',
]);

/**
 * The paths that take a body without changing anything, so an `analyst` may reach them.
 *
 * Stated as the exception rather than listing the writes, for the same reason `PUBLIC_PATHS`
 * is: the default has to be the safe one. A write route added tomorrow is admin-only until
 * somebody names it here, and naming it here is a visible edit.
 */
const ANALYST_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
const ANALYST_PATHS: ReadonlySet<string> = new Set(['/ask']);

const REFUSED = { message: 'Sign in first' };
const FORBIDDEN = { message: 'Your account can read this data but not change it' };

/**
 * Runs on `onRequest`, which is before body parsing and before validation: an
 * unauthenticated request never reaches a schema, so it cannot be used to read one. The role
 * check sits in the same hook, so a write is refused before its body is parsed too.
 *
 * Registered through `after` so it lands behind the cookie plugin's own hook — a guard that
 * ran first would read a request whose cookies had not been parsed yet.
 */
export function registerGuard(app: App): void {
  app.after(() => {
    app.addHook('onRequest', async (request, reply) => {
      const path = request.routeOptions.url ?? request.url;
      if (PUBLIC_PATHS.has(path)) return;

      const session = readSession(request);
      if (session === null) {
        await reply.code(401).send(REFUSED);
        return;
      }

      if (session.role === 'admin') return;
      if (ANALYST_METHODS.has(request.method) || ANALYST_PATHS.has(path)) return;

      await reply.code(403).send(FORBIDDEN);
    });
  });
}
