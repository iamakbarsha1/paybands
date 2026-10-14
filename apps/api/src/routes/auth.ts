import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client';
import type { App } from '../app';
import { hashPassword, verifyPassword } from '../auth/password';
import { clearSession, issueSession, readSession } from '../auth/session';
import { findUserByEmail, findUserById, type AppUserRow } from '../repositories/users';

const credentials = z.strictObject({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

const userResponse = z.strictObject({
  user: z.strictObject({
    id: z.number(),
    email: z.string(),
    displayName: z.string(),
  }),
});

const unauthorized = z.strictObject({ message: z.string() });

/** One message for every failure: a probe should not learn which half it got right. */
const REFUSED = { message: 'Email or password is wrong' };

function onWire(user: AppUserRow): z.infer<typeof userResponse> {
  return { user: { id: user.id, email: user.email, displayName: user.displayName } };
}

export function registerAuthRoutes(app: App, prisma: PrismaClient): void {
  app.post(
    '/auth/login',
    { schema: { body: credentials, response: { 200: userResponse, 401: unauthorized } } },
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

      issueSession(reply, user.id);
      return reply.send(onWire(user));
    },
  );

  app.get(
    '/auth/me',
    { schema: { response: { 200: userResponse, 401: unauthorized } } },
    async (request, reply) => {
      const userId = readSession(request);
      if (userId === null) return reply.code(401).send(REFUSED);

      const user = await findUserById(prisma, userId);
      if (user === null) {
        // The signature was good and the account is gone: the cookie outlived its subject.
        clearSession(reply);
        return reply.code(401).send(REFUSED);
      }

      return reply.send(onWire(user));
    },
  );

  app.post('/auth/logout', async (_request, reply) => {
    clearSession(reply);
    return reply.code(204).send();
  });
}
