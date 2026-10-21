import { sessionUser as userResponse } from '@paybands/core';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { hashPassword, verifyPassword } from '../auth/password';
import { createLimiter, limitHook, LOGIN_ATTEMPTS, LOGIN_WINDOW_MS } from '../auth/rate-limit';
import { clearSession, issueSession, readSession } from '../auth/session';
import { findUserByEmail, findUserById, type AppUserRow } from '../repositories/users';

const credentials = z.strictObject({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

const unauthorized = z.strictObject({ message: z.string() });

/** One message for every failure: a probe should not learn which half it got right. */
const REFUSED = { message: 'Email or password is wrong' };

function onWire(user: AppUserRow): z.infer<typeof userResponse> {
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  };
}

export function registerAuthRoutes(app: App, prisma: PrismaClient, crossSite: boolean): void {
  const take = createLimiter(LOGIN_ATTEMPTS, LOGIN_WINDOW_MS);

  app.post(
    '/auth/login',
    {
      onRequest: limitHook(
        take,
        (request) => request.ip,
        (seconds) => `Too many sign-in attempts. Try again in ${String(seconds)} seconds.`,
      ),
      schema: { body: credentials, response: { 200: userResponse, 401: unauthorized } },
    },
    async (request, reply) => {
      const user = await findUserByEmail(prisma, request.body.email);

      if (user === null) {
        // Hash anyway. Answering an unknown email faster than a wrong password is how a
        // list of real accounts gets built without a single successful login.
        await hashPassword(request.body.password);
        return reply.code(401).send(REFUSED);
      }

      if (!(await verifyPassword(user.passwordHash, request.body.password))) {
        return reply.code(401).send(REFUSED);
      }

      issueSession(reply, { userId: user.id, role: user.role }, crossSite);
      return reply.send(onWire(user));
    },
  );

  app.get(
    '/auth/me',
    { schema: { response: { 200: userResponse, 401: unauthorized } } },
    async (request, reply) => {
      const session = readSession(request);
      if (session === null) return reply.code(401).send(REFUSED);

      const user = await findUserById(prisma, session.userId);
      if (user === null) {
        // The signature was good and the account is gone: the cookie outlived its subject.
        clearSession(reply, crossSite);
        return reply.code(401).send(REFUSED);
      }

      // The cookie's role, not the row's. They differ only between a demotion and the next
      // sign-in, and in that window the cookie is what the guard enforces — so it is also
      // what the screen should describe, or the browser hides a button the API would allow.
      return reply.send(onWire({ ...user, role: session.role }));
    },
  );

  app.post('/auth/logout', async (_request, reply) => {
    clearSession(reply, crossSite);
    return reply.code(204).send();
  });
}
